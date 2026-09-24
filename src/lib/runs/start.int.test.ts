// startRun against the real tables. `npm run test:int`. RUNNER=queue, so a start becomes a jobs row and never an
// agent run. Runs are "[int] ..." in workspaces "int-engine-start*", deleted after with their jobs and settings.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, count, eq, gte, inArray, notInArray, sum } from "drizzle-orm";
import { db } from "@/db";
import { jobs, runs, workspaceSettings } from "@/db/schema";
import { AgentLimits } from "@/contracts/agent";
import { holdsASlot } from "@/lib/runner/recover";
import { startOfUtcDay } from "@/lib/usage/budget-rule";
import { IN_FLIGHT_MESSAGE, MAX_IN_FLIGHT, RunLimitError } from "./limits";
import { startRun } from "./start";

const RACE_WS = `int-engine-start-race-${process.pid}`; // per process: other worktrees run these tests against the same database
const STRANDED_WS = `int-engine-start-stranded-${process.pid}`; // per process: other worktrees run these tests against the same database
const OTHER_WS = `int-engine-start-other-${process.pid}`; // per process: other worktrees run these tests against the same database
const CAP_WS = [0, 1, 2].map((i) => `int-engine-start-cap-${i}-${process.pid}`); // workspaces with room of their own
const FILL_WS = `int-engine-start-fill-${process.pid}`; // the rest of the deployment's runs in flight, made up
const ALL = [RACE_WS, STRANDED_WS, OTHER_WS, ...CAP_WS, FILL_WS];
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
let ip = 0;
const nextIp = () => `int-ip-${process.pid}-${++ip}`; // a fresh address per start: the per-address bucket is not what is tested

async function limitInFlight(workspaceId: string, maxInFlight: number) {
  await db
    .insert(workspaceSettings)
    .values({ workspaceId, maxInFlight })
    .onConflictDoUpdate({ target: workspaceSettings.workspaceId, set: { maxInFlight } });
}
async function strandedRun(workspaceId: string) {
  const [row] = await db
    .insert(runs)
    .values({ prompt: "[int] stranded by a server restart", status: "running", model: "test", workspaceId, createdAt: minutesAgo(40) })
    .returning({ id: runs.id });
  return row.id;
}
/** Runs holding a deployment slot now, in every workspace (other worktrees' tests' runs included). */
async function inFlightEverywhere() {
  const [row] = await db.select({ n: count() }).from(runs).where(holdsASlot(new Date()));
  return row.n;
}
/** Makes up runs in flight until the deployment holds `total` of them; false when others already hold more. */
async function fillDeploymentTo(total: number): Promise<boolean> {
  const missing = total - (await inFlightEverywhere());
  if (missing > 0) {
    await db.insert(runs).values(Array.from({ length: missing }, () => ({ prompt: "[int] another workspace's run", status: "running", model: "test", workspaceId: FILL_WS })));
  }
  return missing >= 0;
}
async function clearThisFilesRuns() {
  await db.delete(jobs).where(inArray(jobs.runId, db.select({ id: runs.id }).from(runs).where(inArray(runs.workspaceId, ALL))));
  await db.delete(runs).where(inArray(runs.workspaceId, ALL));
}
const statusOf = async (id: string) => (await db.select({ status: runs.status, error: runs.error }).from(runs).where(eq(runs.id, id)))[0];

beforeEach(() => {
  vi.stubEnv("RUNNER", "queue");
});
afterEach(() => {
  vi.unstubAllEnvs(); // a test's own DEPLOYMENT_DAILY_BUDGET_USD ends with it
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await clearThisFilesRuns();
  await db.delete(workspaceSettings).where(inArray(workspaceSettings.workspaceId, ALL));
});

describe.skipIf(!process.env.DATABASE_URL)("startRun", () => {
  it("lets no more runs through than the workspace's in-flight limit when five starts arrive at once (Q87)", async () => {
    await limitInFlight(RACE_WS, 2);
    const ctx = { workspaceId: RACE_WS, userId: "int-user" };
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => startRun(ctx, { prompt: `[int] parallel start number ${i}` }, nextIp())),
    );

    const started = results.filter((r) => r.status === "fulfilled");
    const refused = results.flatMap((r) => (r.status === "rejected" ? [r.reason] : []));
    expect(started).toHaveLength(2);
    expect(refused).toHaveLength(3);
    for (const e of refused) {
      expect(e).toBeInstanceOf(RunLimitError);
      expect((e as Error).message).toBe("2 runs are already working. Wait for one to finish.");
    }
    expect(await db.select().from(runs).where(eq(runs.workspaceId, RACE_WS))).toHaveLength(2);
  });

  it("closes the workspace's stranded runs on the way in, so a dead run never holds a slot (Q84)", async () => {
    await limitInFlight(STRANDED_WS, 1);
    const stranded = await strandedRun(STRANDED_WS);

    const { id } = await startRun({ workspaceId: STRANDED_WS, userId: "int-user" }, { prompt: "[int] a start after a restart" }, nextIp());
    expect(id).toBeTruthy();
    expect(await statusOf(stranded)).toEqual({ status: "failed", error: "The server stopped while running it" });
  });

  it("leaves another workspace's stranded run alone: a start only sweeps its own workspace", async () => {
    await limitInFlight(STRANDED_WS, 3);
    const theirs = await strandedRun(OTHER_WS);
    await startRun({ workspaceId: STRANDED_WS, userId: "int-user" }, { prompt: "[int] a start in the other workspace" }, nextIp());
    expect((await statusOf(theirs)).status).toBe("running");
  });

  // Security QA: each workspace has limits of its own, and anyone can make workspaces, all on the operator's key.
  // The database is shared: other worktrees' runs hold slots too, so each test first clears this file's runs and then
  // makes up the rest; a test that needs a free slot when others already hold them all is skipped, not failed.
  describe("the deployment's cap", () => {
    beforeEach(clearThisFilesRuns);
    afterEach(clearThisFilesRuns);

    it("refuses any start once six runs are in flight across the deployment, even in a workspace with room of its own", async () => {
      await fillDeploymentTo(MAX_IN_FLIGHT);
      await expect(startRun({ workspaceId: CAP_WS[0], userId: "int-user" }, { prompt: "[int] one start too many" }, nextIp())).rejects.toThrow(IN_FLIGHT_MESSAGE);
      expect(await db.select().from(runs).where(eq(runs.workspaceId, CAP_WS[0]))).toHaveLength(0);
    });

    it("lets only one of three parallel starts in different workspaces take the deployment's last slot", async (t) => {
      if (!(await fillDeploymentTo(MAX_IN_FLIGHT - 1))) t.skip();
      const results = await Promise.allSettled(
        CAP_WS.map((workspaceId) => startRun({ workspaceId, userId: "int-user" }, { prompt: "[int] racing for the last slot" }, nextIp())),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const refused = results.flatMap((r) => (r.status === "rejected" ? [r.reason as Error] : []));
      expect(refused.map((e) => e.message)).toEqual([IN_FLIGHT_MESSAGE, IN_FLIGHT_MESSAGE]);
    });

    // Security review S1, his call: a day's spend across every workspace is capped too (DEPLOYMENT_DAILY_BUDGET_USD)
    it("refuses any start in plain words once the deployment's money for today is spent, and makes no run", async () => {
      vi.stubEnv("DEPLOYMENT_DAILY_BUDGET_USD", "0"); // today's spend, whatever it is in this shared database, has reached $0
      await expect(startRun({ workspaceId: CAP_WS[2], userId: "int-user" }, { prompt: "[int] a start past the day's money" }, nextIp())).rejects.toThrow(
        "Handover has reached today's spending limit. Try again tomorrow.",
      );
      expect(await db.select().from(runs).where(eq(runs.workspaceId, CAP_WS[2]))).toHaveLength(0);
    });

    it("counts today's finished runs of every workspace, and reserves each run in flight at its most", async () => {
      const [spent] = await db.insert(runs).values({ prompt: "[int] another workspace's finished run", status: "succeeded", model: "test", workspaceId: FILL_WS, costUsd: 3 }).returning({ id: runs.id });
      expect(spent.id).toBeTruthy();
      const live = await inFlightEverywhere();
      const [today] = await db.select({ usd: sum(runs.costUsd) }).from(runs).where(and(gte(runs.createdAt, startOfUtcDay(new Date())), notInArray(runs.status, ["queued", "running", "evaluating"])));
      const committed = Number(today.usd ?? 0) + live * AgentLimits.maxBudgetUsd;

      vi.stubEnv("DEPLOYMENT_DAILY_BUDGET_USD", String(committed)); // exactly what is spent and reserved: no room
      await expect(startRun({ workspaceId: CAP_WS[2], userId: "int-user" }, { prompt: "[int] one start past the reserve" }, nextIp())).rejects.toThrow(RunLimitError);
      vi.stubEnv("DEPLOYMENT_DAILY_BUDGET_USD", String(committed + 1)); // a dollar of room: the start goes ahead
      expect((await startRun({ workspaceId: CAP_WS[2], userId: "int-user" }, { prompt: "[int] a start with a dollar of room" }, nextIp())).id).toBeTruthy();
    });

    it("does not count a run stranded in another workspace against the deployment's cap", async (t) => {
      if (!(await fillDeploymentTo(MAX_IN_FLIGHT - 1))) t.skip();
      await strandedRun(OTHER_WS); // nobody will close it until that workspace starts again: it must not hold a slot
      const { id } = await startRun({ workspaceId: CAP_WS[1], userId: "int-user" }, { prompt: "[int] a start beside a stranded run" }, nextIp());
      expect(id).toBeTruthy();
    });
  });
});

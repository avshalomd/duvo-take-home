// startRun against the real tables. `npm run test:int`. RUNNER=queue, so a start becomes a jobs row and never an
// agent run. Runs are "[int] ..." in workspaces "int-engine-start*", deleted after with their jobs and settings.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { jobs, runs, workspaceSettings } from "@/db/schema";
import { RunLimitError } from "./limits";
import { startRun } from "./start";

const RACE_WS = `int-engine-start-race-${process.pid}`; // per process: other worktrees run these tests against the same database
const STRANDED_WS = `int-engine-start-stranded-${process.pid}`; // per process: other worktrees run these tests against the same database
const OTHER_WS = `int-engine-start-other-${process.pid}`; // per process: other worktrees run these tests against the same database
const ALL = [RACE_WS, STRANDED_WS, OTHER_WS];
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
const statusOf = async (id: string) => (await db.select({ status: runs.status, error: runs.error }).from(runs).where(eq(runs.id, id)))[0];

beforeEach(() => {
  vi.stubEnv("RUNNER", "queue");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.delete(jobs).where(inArray(jobs.runId, db.select({ id: runs.id }).from(runs).where(inArray(runs.workspaceId, ALL))));
  await db.delete(runs).where(inArray(runs.workspaceId, ALL));
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
});

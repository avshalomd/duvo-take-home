// "Run again" against the real tables. `npm run test:int`. RUNNER=queue, so a start becomes a jobs row and never an
// agent run. Runs are "[int] ..." in workspaces "int-engine-again*", deleted after with their jobs.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { jobs, runs, workspaceSettings } from "@/db/schema";
import { followUpInstructions } from "@/lib/agent/follow-up-prompt";
import { startRunAgain } from "./run-again";

const WS = `int-engine-again-${process.pid}`; // per process: other worktrees run these tests against the same database
const OTHER_WS = `int-engine-again-other-${process.pid}`;
const ctx = { workspaceId: WS, userId: "int-user" };
let ip = 0;
const nextIp = () => `int-again-${process.pid}-${++ip}`; // a fresh address per start: the per-address bucket is not what is tested

async function finished(fields: Partial<typeof runs.$inferInsert>) {
  const [row] = await db.insert(runs).values({ prompt: "[int] a run", status: "succeeded", model: "test", workspaceId: WS, ...fields }).returning({ id: runs.id });
  return row.id;
}
const promptOf = async (id: string) => (await db.select().from(runs).where(eq(runs.id, id)))[0];

beforeEach(() => {
  vi.stubEnv("RUNNER", "queue");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.delete(jobs).where(inArray(jobs.runId, db.select({ id: runs.id }).from(runs).where(inArray(runs.workspaceId, [WS, OTHER_WS]))));
  await db.delete(runs).where(inArray(runs.workspaceId, [WS, OTHER_WS]));
  await db.delete(workspaceSettings).where(inArray(workspaceSettings.workspaceId, [WS, OTHER_WS])); // a start's budget check makes the row (QA F22)
});

describe.skipIf(!process.env.DATABASE_URL)("startRunAgain", () => {
  it("runs a plain run's own brief again, as a new run of its own", async () => {
    const id = await finished({ prompt: "[int] Chart the five largest EU countries by population" });
    const again = await startRunAgain(ctx, id, nextIp());
    const row = await promptOf(again!.id);
    expect(row.prompt).toBe("[int] Chart the five largest EU countries by population");
    expect(row.parentRunId).toBeNull();
    expect(row.purpose).toBe("adhoc");
  });

  // A follow-up's own prompt is only the change: "Run again" started a paid run whose whole brief was "Make the bars
  // horizontal".
  it("runs a follow-up's whole instructions again - the first brief and every change - never the change alone", async () => {
    const first = await finished({ prompt: "[int] Chart the five largest EU countries by population" });
    const change = await finished({ prompt: "Make the bars horizontal", purpose: "followup", parentRunId: first });
    const again = await startRunAgain(ctx, change, nextIp());
    expect((await promptOf(again!.id)).prompt).toBe(followUpInstructions("[int] Chart the five largest EU countries by population", "Make the bars horizontal"));
  });

  it("starts nothing for another workspace's run: its brief is not the caller's to run", async () => {
    const theirs = await finished({ workspaceId: OTHER_WS, prompt: "[int] another workspace's brief" });
    expect(await startRunAgain(ctx, theirs, nextIp())).toBeNull();
    expect(await db.select().from(runs).where(eq(runs.prompt, "[int] another workspace's brief"))).toHaveLength(1);
  });
});

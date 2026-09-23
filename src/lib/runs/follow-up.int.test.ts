// "Ask for a change", against the real tables. `npm run test:int`. RUNNER=queue, so the follow-up becomes a jobs row
// instead of an agent run. Runs are "[int] ..." in workspace "int-engine-followup", deleted after.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { jobs, runs } from "@/db/schema";
import { startFollowUp } from "./follow-up";

const WS = "int-engine-followup";
const OTHER_WS = "int-engine-followup-other";
const ctx = { workspaceId: WS, userId: "int-user" };

async function makeRun(what: string, status: string, ws = WS) {
  const [row] = await db.insert(runs).values({ prompt: `[int] ${what}`, status, model: "test", workspaceId: ws }).returning({ id: runs.id });
  return row.id;
}

beforeEach(() => {
  vi.stubEnv("RUNNER", "queue");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  const mine = db.select({ id: runs.id }).from(runs).where(inArray(runs.workspaceId, [WS, OTHER_WS]));
  await db.delete(jobs).where(inArray(jobs.runId, mine));
  await db.delete(runs).where(inArray(runs.workspaceId, [WS, OTHER_WS]));
});

describe.skipIf(!process.env.DATABASE_URL)("startFollowUp", () => {
  it("starts a follow-up of a finished run: purpose followup, pointing at its parent, in the same workspace", async () => {
    const parent = await makeRun("parent succeeded", "succeeded");
    const { id } = await startFollowUp(ctx, { runId: parent, prompt: "[int] Add a column with the source's country" });

    const [row] = await db.select().from(runs).where(eq(runs.id, id));
    expect(row.purpose).toBe("followup");
    expect(row.parentRunId).toBe(parent);
    expect(row.workspaceId).toBe(WS);
    expect(row.createdBy).toBe("int-user");
    expect(row.prompt).toBe("[int] Add a column with the source's country");
    expect(row.status).toBe("queued");
    expect(await db.select().from(jobs).where(eq(jobs.runId, id))).toHaveLength(1);
  });

  it.each(["failed", "cancelled"])("continues a %s run too: a change can rescue it", async (status) => {
    const parent = await makeRun(`parent ${status}`, status);
    await expect(startFollowUp(ctx, { runId: parent, prompt: "[int] Try again with RSS" })).resolves.toHaveProperty("id");
  });

  it.each(["queued", "running", "evaluating"])("refuses while the parent is %s, in plain words", async (status) => {
    const parent = await makeRun(`parent ${status}`, status);
    await expect(startFollowUp(ctx, { runId: parent, prompt: "[int] Add a column" })).rejects.toThrow(
      "Wait until this run has finished before asking for a change",
    );
  });

  it("reads another workspace's run as not found", async () => {
    const parent = await makeRun("their parent", "succeeded", OTHER_WS);
    await expect(startFollowUp(ctx, { runId: parent, prompt: "[int] Add a column" })).rejects.toThrow("This run was not found");
  });

  it("accepts a short change the start form would refuse (under 10 characters): 'Fix' is a whole request here", async () => {
    const parent = await makeRun("parent for a short change", "succeeded");
    await expect(startFollowUp(ctx, { runId: parent, prompt: "[int] Fix" })).resolves.toHaveProperty("id");
  });

  it("refuses an empty change with the form's words", async () => {
    const parent = await makeRun("parent for an empty change", "succeeded");
    await expect(startFollowUp(ctx, { runId: parent, prompt: " " })).rejects.toThrow("Say what should change");
  });
});

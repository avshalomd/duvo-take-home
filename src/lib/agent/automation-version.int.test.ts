// Q82 end to end, without a model: runAutomation on a queued run whose automation changed since it was queued must
// close it as failed before the agent starts. `npm run test:int`. Rows are "[int] ..." in "int-engine-auto", deleted after.
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { db } from "@/db";
import { automations, runEvents, runs, workspaceSettings } from "@/db/schema";
import { runAutomation } from "./run";

// The agent must never start here; if the check regresses, this fails the run at once instead of paying for an agent.
vi.mock("@anthropic-ai/claude-agent-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@anthropic-ai/claude-agent-sdk")>()),
  query: vi.fn(() => {
    throw new Error("the agent must not start for this run");
  }),
}));

const WS = `int-engine-auto-${process.pid}`; // per process: other worktrees run these tests against the same database
const template = {
  instructions: "[int] Write hello.md with a greeting for {input}",
  intent: "a greeting",
  expectedOutputs: ["hello.md"],
  outputFormat: "",
  steps: ["Write hello.md"],
  connections: [],
};

afterAll(async () => {
  const mine = await db.select({ id: runs.id }).from(runs).where(eq(runs.workspaceId, WS));
  for (const r of mine) await db.delete(runEvents).where(eq(runEvents.runId, r.id));
  await db.delete(runs).where(eq(runs.workspaceId, WS));
  await db.delete(automations).where(eq(automations.workspaceId, WS));
  await db.delete(workspaceSettings).where(eq(workspaceSettings.workspaceId, WS));
});

describe.skipIf(!process.env.DATABASE_URL)("runAutomation and the automation's version (Q82)", () => {
  it("fails a queued command run whose automation was edited back to draft, before the agent starts", async () => {
    const [a] = await db
      .insert(automations)
      .values({ workspaceId: WS, name: "[int] edited after queueing", command: "int-edited", template, status: "draft", version: 2 })
      .returning({ id: automations.id });
    const [run] = await db
      .insert(runs)
      .values({
        prompt: "[int] Write hello.md with a greeting for Acme",
        status: "queued",
        model: "test",
        workspaceId: WS,
        purpose: "automation",
        automationId: a.id,
        automationVersion: 1, // queued while version 1 was the approved one
        input: "Acme",
      })
      .returning({ id: runs.id });

    await runAutomation(run.id);

    const [after] = await db.select().from(runs).where(eq(runs.id, run.id));
    expect(after.status).toBe("failed");
    expect(after.error).toBe("The automation was changed after this run was queued; run it again once it is approved");
    expect(after.finishedAt).not.toBeNull();
    expect(await db.select().from(runEvents).where(eq(runEvents.runId, run.id))).toHaveLength(0); // no agent, no trace
    expect(query).not.toHaveBeenCalled();
  });
});

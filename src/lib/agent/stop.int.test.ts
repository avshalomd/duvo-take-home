// Q129 end to end, without a model: a run stopped mid-way closes as cancelled with its time and turns recorded.
// query() is replaced by a fake agent that sends init and one turn, then works until it is aborted. `npm run test:int`.
// Rows are "[int] ..." in "int-engine-stop", deleted after.
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { runEvents, runs, workspaceSettings } from "@/db/schema";
import { cancelRun } from "@/lib/runs/cancel";
import { runAutomation } from "./run";

vi.mock("@anthropic-ai/claude-agent-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@anthropic-ai/claude-agent-sdk")>()),
  query: vi.fn(({ options }: { options: { abortController: AbortController } }) =>
    (async function* fakeAgent() {
      yield { type: "system", subtype: "init", session_id: "00000000-0000-4000-8000-0000000c0de5", model: "fake", tools: [], mcp_servers: [], cwd: "" };
      yield { type: "assistant", message: { content: [{ type: "text", text: "Working on it." }] } };
      // works until Stop aborts it, as a real agent in the middle of a long search would
      await new Promise((_, reject) => options.abortController.signal.addEventListener("abort", () => reject(new Error("aborted"))));
    })(),
  ),
}));

const WS = `int-engine-stop-${process.pid}`; // per process: other worktrees run these tests against the same database

afterAll(async () => {
  const mine = await db.select({ id: runs.id }).from(runs).where(eq(runs.workspaceId, WS));
  for (const r of mine) await db.delete(runEvents).where(eq(runEvents.runId, r.id));
  await db.delete(runs).where(eq(runs.workspaceId, WS));
  await db.delete(workspaceSettings).where(eq(workspaceSettings.workspaceId, WS));
});

describe.skipIf(!process.env.DATABASE_URL)("a run stopped mid-way (Q129)", () => {
  it("closes as cancelled with the time from start to stop and its turns, even when the SDK left no cost", async () => {
    const [row] = await db
      .insert(runs)
      .values({ prompt: "[int] a long search the user stops", status: "queued", model: "test", workspaceId: WS })
      .returning({ id: runs.id });

    const running = runAutomation(row.id);
    // wait until the fake agent's turn is recorded, then press Stop
    for (let i = 0; i < 50; i++) {
      const events = await db.select().from(runEvents).where(eq(runEvents.runId, row.id));
      if (events.some((e) => e.kind === "text")) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await cancelRun(WS, row.id);
    await running;

    const [after] = await db.select().from(runs).where(eq(runs.id, row.id));
    expect(after.status).toBe("cancelled");
    expect(after.error).toBe("Stopped by you");
    expect(after.sessionId).toBe("00000000-0000-4000-8000-0000000c0de5");
    expect(after.durationMs).toBeGreaterThan(0);
    expect(after.numTurns).toBe(1);
    expect(after.costUsd).toBeNull(); // no transcript for a fake session: no number rather than a guess
  }, 20_000);
});

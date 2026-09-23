// Q134 end to end, without a model: what the loop hands the child, and the tripwire when the child is offered a tool
// source nobody added. query() is a fake agent whose init lists a claude.ai connector, then works until aborted.
// `npm run test:int`. Rows are "[int] ..." in "int-engine-isolation-<pid>", deleted after.
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { runEvents, runs, workspaceSettings } from "@/db/schema";
import { tripwireReason } from "./mcp-tripwire";
import { runAutomation } from "./run";

const handed: { options?: Record<string, unknown> } = {};
vi.mock("@anthropic-ai/claude-agent-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@anthropic-ai/claude-agent-sdk")>()),
  query: vi.fn(({ options }: { options: Record<string, unknown> & { abortController: AbortController } }) => {
    handed.options = options;
    return (async function* fakeAgent() {
      yield {
        type: "system",
        subtype: "init",
        session_id: "00000000-0000-4000-8000-0000000150a7",
        model: "fake",
        tools: ["mcp__claude_ai_Gmail__search"],
        mcp_servers: [
          { name: "plan", status: "connected" },
          { name: "outputs", status: "connected" },
          { name: "claude.ai Gmail", status: "connected" },
        ],
        cwd: "",
      };
      // would go on working, and could read the developer's mail, until the tripwire aborts it
      await new Promise((_, reject) => options.abortController.signal.addEventListener("abort", () => reject(new Error("aborted"))));
    })();
  }),
}));

const WS = `int-engine-isolation-${process.pid}`; // per process: other worktrees run these tests against the same database

afterAll(async () => {
  const mine = await db.select({ id: runs.id }).from(runs).where(eq(runs.workspaceId, WS));
  for (const r of mine) await db.delete(runEvents).where(eq(runEvents.runId, r.id));
  await db.delete(runs).where(eq(runs.workspaceId, WS));
  await db.delete(workspaceSettings).where(eq(workspaceSettings.workspaceId, WS));
});

describe.skipIf(!process.env.DATABASE_URL)("the agent child's isolation (Q134)", () => {
  it("stops a run whose child was offered a tool source the workspace did not add, and hands the child nothing of ours", async () => {
    const [row] = await db
      .insert(runs)
      .values({ prompt: "[int] a run on a developer's machine", status: "queued", model: "test", workspaceId: WS })
      .returning({ id: runs.id });

    await runAutomation(row.id);

    const [after] = await db.select().from(runs).where(eq(runs.id, row.id));
    expect(after.status).toBe("failed");
    expect(after.error).toBe(tripwireReason(["claude.ai Gmail"]));

    const options = handed.options!;
    expect(options.strictMcpConfig).toBe(true);
    expect(options.settingSources).toEqual([]);
    expect(options.settings).toEqual({ disableClaudeAiConnectors: true });
    const env = options.env as Record<string, string>;
    expect(env.PATH).toBeTruthy();
    expect(env).not.toHaveProperty("DATABASE_URL");
    expect(Object.keys(env).filter((k) => k.startsWith("CLAUDE"))).toEqual([]);
  }, 20_000);
});

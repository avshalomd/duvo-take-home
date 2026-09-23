// Auto-heal end to end, without a model (his call, 2026-09-23): a result the evaluator fails goes back to the same
// agent session with the findings, is evaluated again, and the run keeps the last verdict. query() is a fake agent
// that writes output.csv (broken on its first attempt, fixed after), and the evaluator is scripted. `npm run test:int`.
// Rows are "[int] ..." in "int-engine-heal*-<pid>", deleted after.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { files, runEvents, runs, workspaceSettings } from "@/db/schema";
import type { Verdict } from "@/contracts/eval";
import { evaluateRun } from "@/lib/eval/evaluate";
import { runAutomation } from "./run";

const SESSION = "00000000-0000-4000-8000-00000000h3a1".replace("h", "0");
const BROKEN = 'rank,model,why\n1,a,"fine"\n2,b,small, fast\n';
const FIXED = 'rank,model,why\n1,a,"fine"\n2,b,"small, fast"\n';
const calls: { prompt: string; resume?: string }[] = [];
const hooks: { onAttempt?: (attempt: number) => Promise<void> } = {}; // lets a test look at the run while it heals

vi.mock("@anthropic-ai/claude-agent-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@anthropic-ai/claude-agent-sdk")>()),
  getSessionInfo: vi.fn(async (id: string) => ({ sessionId: id })), // the session is "on this machine", so a heal resumes it
  query: vi.fn(({ prompt, options }: { prompt: string; options: { cwd: string; resume?: string } }) => {
    const attempt = calls.length;
    calls.push({ prompt, resume: options.resume });
    return (async function* fakeAgent() {
      yield { type: "system", subtype: "init", session_id: SESSION, model: "fake", tools: [], mcp_servers: [{ name: "plan", status: "connected" }, { name: "outputs", status: "connected" }], cwd: options.cwd };
      await hooks.onAttempt?.(attempt);
      await writeFile(path.join(options.cwd, "output.csv"), attempt === 0 ? BROKEN : FIXED);
      yield { type: "assistant", message: { content: [{ type: "text", text: `Attempt ${attempt + 1}: wrote output.csv.` }] } };
      // the SDK's total for a resumed session continues from the saved one: 0.01, then 0.03 (0.02 of its own)
      yield { type: "result", subtype: "success", is_error: false, num_turns: 2, duration_ms: 1000, total_cost_usd: 0.01 * (2 * attempt + 1), result: "Wrote output.csv." };
    })();
  }),
}));
vi.mock("@/lib/eval/evaluate", () => ({ evaluateRun: vi.fn() }));
vi.mock("@/lib/eval/feedback", () => ({
  isHealable: (v: Verdict, agentFinished: boolean) => agentFinished && v.verdict === "fail",
  feedbackForAgent: (v: Verdict) => v.reasons.join("\n"),
}));

const verdict = (v: Verdict["verdict"], reasons: string[] = []): Verdict => ({ verdict: v, checks: [], judgment: null, review: null, reasons, evaluatedAt: "2026-09-23T12:00:00.000Z" });
const FAIL = verdict("fail", ["The CSV parses: output.csv: row 2 has 4 fields, the header has 3"]);
const PASS = verdict("pass");

const WS = `int-engine-heal-${process.pid}`; // per process: other worktrees run these tests against the same database
const OFF_WS = `int-engine-heal-off-${process.pid}`;

async function queuedRun(workspaceId: string, what: string) {
  const [row] = await db.insert(runs).values({ prompt: `[int] ${what}`, status: "queued", model: "test", workspaceId }).returning({ id: runs.id });
  return row.id;
}
const healEvents = async (runId: string) => (await db.select().from(runEvents).where(eq(runEvents.runId, runId))).filter((e) => e.kind === "heal");

beforeEach(async () => {
  calls.length = 0;
  hooks.onAttempt = undefined;
  vi.mocked(evaluateRun).mockReset();
  await db.insert(workspaceSettings).values({ workspaceId: WS, autoHealAttempts: 2 }).onConflictDoUpdate({ target: workspaceSettings.workspaceId, set: { autoHealAttempts: 2 } });
  await db.insert(workspaceSettings).values({ workspaceId: OFF_WS, autoHealAttempts: 0 }).onConflictDoUpdate({ target: workspaceSettings.workspaceId, set: { autoHealAttempts: 0 } });
});
afterAll(async () => {
  const mine = db.select({ id: runs.id }).from(runs).where(inArray(runs.workspaceId, [WS, OFF_WS]));
  await db.delete(runEvents).where(inArray(runEvents.runId, mine));
  await db.delete(files).where(inArray(files.runId, mine));
  await db.delete(runs).where(inArray(runs.workspaceId, [WS, OFF_WS]));
  await db.delete(workspaceSettings).where(inArray(workspaceSettings.workspaceId, [WS, OFF_WS]));
});

describe.skipIf(!process.env.DATABASE_URL)("auto-heal", () => {
  it("resumes the same session with the findings, replaces the files, evaluates again and keeps the passing verdict", async () => {
    vi.mocked(evaluateRun).mockResolvedValueOnce(FAIL).mockResolvedValueOnce(PASS);
    const id = await queuedRun(WS, "a CSV with a comma in a value");

    await runAutomation(id);

    const [run] = await db.select().from(runs).where(eq(runs.id, id));
    expect(run.status).toBe("succeeded");
    expect((run.verdict as Verdict).verdict).toBe("pass");
    expect(run.healAttempts).toBe(1);
    expect(run.costUsd).toBeCloseTo(0.03, 10); // 0.01, then 0.02 of the resumed session's own
    expect(run.numTurns).toBe(4);
    expect(run.durationMs).toBe(2000);

    expect(calls).toHaveLength(2);
    expect(calls[1].resume).toBe(SESSION);
    expect(calls[1].prompt).toContain("row 2 has 4 fields, the header has 3");

    const heals = await healEvents(id);
    expect(heals).toHaveLength(1);
    expect(heals[0].payload).toMatchObject({ attempt: 1, max: 2, reasons: FAIL.reasons, feedback: FAIL.reasons[0] });

    const stored = await db.select().from(files).where(eq(files.runId, id));
    expect(stored.map((f) => f.name)).toEqual(["output.csv"]); // replaced, not added twice
    expect(stored[0].content).toBe(FIXED);
  }, 30_000);

  it("stops after the workspace's number of attempts and keeps the last failing verdict", async () => {
    vi.mocked(evaluateRun).mockResolvedValue(FAIL);
    const id = await queuedRun(WS, "a result that stays broken");

    await runAutomation(id);

    const [run] = await db.select().from(runs).where(eq(runs.id, id));
    expect(calls).toHaveLength(3); // the first attempt and two heals
    expect(run.healAttempts).toBe(2);
    expect((run.verdict as Verdict).verdict).toBe("fail");
    expect((await healEvents(id)).map((e) => (e.payload as { attempt: number }).attempt)).toEqual([1, 2]);
  }, 30_000);

  // His words: "The run should say pass or fail only if all the auto-heal tries are exhausted."
  it("never shows a failing verdict while attempts remain: the run stays running, the finding lives in the heal event", async () => {
    vi.mocked(evaluateRun).mockResolvedValue(FAIL);
    const id = await queuedRun(WS, "a result watched while it heals");
    const seen: { status: string; verdict: unknown; healAttempts: number }[] = [];
    hooks.onAttempt = async (attempt) => {
      if (attempt === 0) return;
      const [row] = await db.select().from(runs).where(eq(runs.id, id));
      seen.push({ status: row.status, verdict: row.verdict, healAttempts: row.healAttempts });
    };

    await runAutomation(id);

    expect(seen).toEqual([
      { status: "running", verdict: null, healAttempts: 1 },
      { status: "running", verdict: null, healAttempts: 2 },
    ]);
    const [run] = await db.select().from(runs).where(eq(runs.id, id));
    expect((run.verdict as Verdict).verdict).toBe("fail"); // written once, when the attempts ran out
  }, 30_000);

  it("never heals in a workspace that turned auto-heal off", async () => {
    vi.mocked(evaluateRun).mockResolvedValue(FAIL);
    const id = await queuedRun(OFF_WS, "no second chances here");

    await runAutomation(id);

    const [run] = await db.select().from(runs).where(eq(runs.id, id));
    expect(calls).toHaveLength(1);
    expect(run.healAttempts).toBe(0);
    expect((run.verdict as Verdict).verdict).toBe("fail");
    expect(await healEvents(id)).toHaveLength(0);
  }, 30_000);
});

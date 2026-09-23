// Auto-heal end to end, without a model (his call, 2026-09-23): a result the evaluator fails goes back to the same
// agent session with the findings, is evaluated again, and the run keeps the last verdict. query() is a fake agent
// that writes output.csv (broken on its first attempt, fixed after), and the evaluator is scripted. `npm run test:int`.
// Rows are "[int] ..." in "int-engine-heal*-<pid>", deleted after.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { files, runEvents, runs, workspaceSettings } from "@/db/schema";
import type { Verdict } from "@/contracts/eval";
import { evaluateRun } from "@/lib/eval/evaluate";
import { cancelRun } from "@/lib/runs/cancel";
import { runAutomation } from "./run";

const SESSION = "00000000-0000-4000-8000-00000000h3a1".replace("h", "0");
const BROKEN = 'rank,model,why\n1,a,"fine"\n2,b,small, fast\n';
const FIXED = 'rank,model,why\n1,a,"fine"\n2,b,"small, fast"\n';
const calls: { prompt: string; resume?: string }[] = [];
const hooks: { onAttempt?: (attempt: number) => Promise<void> } = {}; // lets a test look at the run while it heals
// How an attempt ends: its result message, no result at all (the child died mid-stream), or working until aborted.
type Ending = "result" | "no-result" | "hang";
const script: { files: string[]; endings: Ending[] } = { files: [BROKEN, FIXED], endings: [] }; // per attempt; "result" when unset
// What the tests turn: the agent's time budget (to let the wall clock run out) and the SDK's totals for an attempt that
// sent no result (its transcript's cost-state, which a fake session does not have).
const knobs = vi.hoisted(() => ({ budgetMs: null as number | null, sdkTotals: null as { costUsd: number; durationMs: number | null } | null }));

vi.mock("@anthropic-ai/claude-agent-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@anthropic-ai/claude-agent-sdk")>()),
  getSessionInfo: vi.fn(async (id: string) => ({ sessionId: id })), // the session is "on this machine", so a heal resumes it
  query: vi.fn(({ prompt, options }: { prompt: string; options: { cwd: string; resume?: string; abortController: AbortController } }) => {
    const attempt = calls.length;
    calls.push({ prompt, resume: options.resume });
    return (async function* fakeAgent() {
      yield { type: "system", subtype: "init", session_id: SESSION, model: "fake", tools: [], mcp_servers: [{ name: "plan", status: "connected" }, { name: "outputs", status: "connected" }], cwd: options.cwd };
      await hooks.onAttempt?.(attempt);
      await writeFile(path.join(options.cwd, "output.csv"), script.files[attempt] ?? FIXED);
      yield { type: "assistant", message: { content: [{ type: "text", text: `Attempt ${attempt + 1}: wrote output.csv.` }] } };
      const ending = script.endings[attempt] ?? "result";
      if (ending === "hang") await new Promise((_, reject) => options.abortController.signal.addEventListener("abort", () => reject(new Error("aborted"))));
      // the SDK's total for a resumed session continues from the saved one: 0.01, then 0.03 (0.02 of its own)
      if (ending === "result") yield { type: "result", subtype: "success", is_error: false, num_turns: 2, duration_ms: 1000, total_cost_usd: 0.01 * (2 * attempt + 1), result: "Wrote output.csv." };
    })();
  }),
}));
vi.mock("./heal", async (importOriginal) => {
  const real = await importOriginal<typeof import("./heal")>();
  return { ...real, runBudgetMs: (mode: "inline" | "queue" | "route") => knobs.budgetMs ?? real.runBudgetMs(mode) };
});
vi.mock("./stopped-cost", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stopped-cost")>()),
  readSdkTotals: vi.fn(async () => knobs.sdkTotals),
}));
vi.mock("@/lib/eval/evaluate", () => ({ evaluateRun: vi.fn() }));
vi.mock("@/lib/eval/feedback", () => ({
  isHealable: (v: Verdict, agentFinished: boolean) => agentFinished && v.verdict === "fail",
  feedbackForAgent: (v: Verdict) => v.reasons.join("\n"),
}));

const verdict = (v: Verdict["verdict"], reasons: string[] = []): Verdict => ({ verdict: v, checks: [], judgment: null, review: null, reasons, evaluatedAt: "2026-09-23T12:00:00.000Z" });
const FAIL = verdict("fail", ["The CSV parses: output.csv: row 2 has 4 fields, the header has 3"]);
const PASS = verdict("pass");
const FAIL_2 = verdict("fail", ["The reviewer asks: add a source for every row"]);
const FAIL_3 = verdict("fail", ["The reviewer asks: rank by likes, not by size"]);

const WS = `int-engine-heal-${process.pid}`; // per process: other worktrees run these tests against the same database
const OFF_WS = `int-engine-heal-off-${process.pid}`;
const THREE_WS = `int-engine-heal-three-${process.pid}`; // three attempts allowed: room for an attempt to undo another
const BROKE_WS = `int-engine-heal-broke-${process.pid}`; // a daily budget of one cent: the first attempt spends it

async function queuedRun(workspaceId: string, what: string) {
  const [row] = await db.insert(runs).values({ prompt: `[int] ${what}`, status: "queued", model: "test", workspaceId }).returning({ id: runs.id });
  return row.id;
}
const healEvents = async (runId: string) => (await db.select().from(runEvents).where(eq(runEvents.runId, runId)).orderBy(asc(runEvents.seq))).filter((e) => e.kind === "heal"); // in the order they happened

beforeEach(async () => {
  calls.length = 0;
  hooks.onAttempt = undefined;
  script.files = [BROKEN, FIXED];
  script.endings = [];
  knobs.budgetMs = null;
  knobs.sdkTotals = null;
  await db.insert(workspaceSettings).values({ workspaceId: THREE_WS, autoHealAttempts: 3 }).onConflictDoUpdate({ target: workspaceSettings.workspaceId, set: { autoHealAttempts: 3 } });
  vi.mocked(evaluateRun).mockReset();
  await db.insert(workspaceSettings).values({ workspaceId: WS, autoHealAttempts: 2 }).onConflictDoUpdate({ target: workspaceSettings.workspaceId, set: { autoHealAttempts: 2 } });
  await db.insert(workspaceSettings).values({ workspaceId: OFF_WS, autoHealAttempts: 0 }).onConflictDoUpdate({ target: workspaceSettings.workspaceId, set: { autoHealAttempts: 0 } });
  await db.insert(workspaceSettings).values({ workspaceId: BROKE_WS, autoHealAttempts: 2, dailyBudgetUsd: 0.01 }).onConflictDoUpdate({ target: workspaceSettings.workspaceId, set: { autoHealAttempts: 2, dailyBudgetUsd: 0.01 } });
});
afterAll(async () => {
  const mine = db.select({ id: runs.id }).from(runs).where(inArray(runs.workspaceId, [WS, OFF_WS, THREE_WS, BROKE_WS]));
  await db.delete(runEvents).where(inArray(runEvents.runId, mine));
  await db.delete(files).where(inArray(files.runId, mine));
  await db.delete(runs).where(inArray(runs.workspaceId, [WS, OFF_WS, THREE_WS, BROKE_WS]));
  await db.delete(workspaceSettings).where(inArray(workspaceSettings.workspaceId, [WS, OFF_WS, THREE_WS, BROKE_WS]));
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

    // Q149: each attempt's own cost beside the SDK's raw running total, for Details
    const finished = (await db.select().from(runEvents).where(eq(runEvents.runId, id)).orderBy(asc(runEvents.seq))).filter((e) => e.kind === "finished");
    const costs = finished.map((e) => e.payload as { total_cost_usd: number; attempt_cost_usd: number });
    expect(costs.map((c) => c.total_cost_usd)).toEqual([0.01, 0.03]);
    expect(costs[0].attempt_cost_usd).toBeCloseTo(0.01, 10);
    expect(costs[1].attempt_cost_usd).toBeCloseTo(0.02, 10);
  }, 30_000);

  // Q148: the live heal of 2026-09-23 put quotes in for the CSV check, took them out for the reviewer, and was back
  // where it started. An attempt that brings back an earlier attempt's files or failures stops the healing.
  it("stops healing when an attempt brings back an earlier attempt's files, and writes the final verdict", async () => {
    script.files = [BROKEN, FIXED, BROKEN, FIXED];
    const REVIEWER = verdict("fail", ['Remove the quotes around "small, cheap" - the rows were asked for as given']);
    vi.mocked(evaluateRun).mockResolvedValueOnce(FAIL).mockResolvedValueOnce(REVIEWER).mockResolvedValueOnce(FAIL).mockResolvedValue(PASS);
    const id = await queuedRun(THREE_WS, "a heal that undoes itself");

    await runAutomation(id);

    expect(calls).toHaveLength(3); // the fourth attempt, which would only undo the third, is never paid for
    const [run] = await db.select().from(runs).where(eq(runs.id, id));
    expect(run.healAttempts).toBe(2);
    expect((run.verdict as Verdict).verdict).toBe("fail");
    const heals = (await healEvents(id)).map((e) => e.payload as { attempt: number; stopped?: string });
    expect(heals.map((h) => h.attempt)).toEqual([1, 2, 3]);
    expect(heals.slice(0, 2).every((h) => h.stopped === undefined)).toBe(true);
    expect(heals[2].stopped).toBe("The fix undid an earlier one: the files are back to an earlier attempt's, so healing stopped here.");
  }, 30_000);

  it("stops after the workspace's number of attempts and keeps the last failing verdict", async () => {
    // each attempt fails differently, with different files: progress, so only the limit stops it (Q148 aside)
    script.files = [BROKEN, FIXED, `${FIXED}3,c,"third"\n`];
    vi.mocked(evaluateRun).mockResolvedValueOnce(FAIL).mockResolvedValueOnce(FAIL_2).mockResolvedValue(FAIL_3);
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
    script.files = [BROKEN, FIXED, `${FIXED}3,c,"third"\n`];
    vi.mocked(evaluateRun).mockResolvedValueOnce(FAIL).mockResolvedValueOnce(FAIL_2).mockResolvedValue(FAIL_3);
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

// A run ended by the wall clock, the tripwire or a child that died mid-stream was closed with no cost, duration or
// turns, so the day's budget never saw what it spent. It records them the way a stopped run does (Q129).
describe.skipIf(!process.env.DATABASE_URL)("what a failed run spent", () => {
  const runRow = async (id: string) => (await db.select().from(runs).where(eq(runs.id, id)))[0];

  it("records an attempt that ended without a result at the SDK's own totals", async () => {
    script.endings = ["no-result"];
    knobs.sdkTotals = { costUsd: 0.04, durationMs: 1500 };
    const id = await queuedRun(WS, "a child that dies mid-stream");

    await runAutomation(id);

    const run = await runRow(id);
    expect(run.status).toBe("failed");
    expect(run.error).toBe("the agent ended without a result");
    expect(run.costUsd).toBeCloseTo(0.04, 10);
    expect(run.durationMs).toBe(1500);
    expect(run.numTurns).toBe(1);
  }, 30_000);

  it("records a run the wall clock cut off with what it spent, and says it timed out", async () => {
    script.endings = ["hang"];
    knobs.budgetMs = 300;
    knobs.sdkTotals = { costUsd: 0.02, durationMs: null };
    const id = await queuedRun(WS, "a tool that never answers");

    await runAutomation(id);

    const run = await runRow(id);
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/^timed out after \d+ s$/);
    expect(run.costUsd).toBeCloseTo(0.02, 10);
    expect(run.durationMs).toBeGreaterThan(0); // no duration from the SDK: the time from the attempt's start
    expect(run.numTurns).toBe(1);
  }, 30_000);

  it("adds a fix attempt that died to what the attempts before it cost, and keeps the last verdict", async () => {
    script.endings = ["result", "no-result"];
    vi.mocked(evaluateRun).mockResolvedValueOnce(FAIL);
    knobs.sdkTotals = { costUsd: 0.05, durationMs: 800 }; // the resumed session's running total: 0.04 of its own
    const id = await queuedRun(WS, "a fix attempt that dies");

    await runAutomation(id);

    const run = await runRow(id);
    expect(calls).toHaveLength(2);
    expect(run.status).toBe("failed");
    expect(run.costUsd).toBeCloseTo(0.05, 10); // 0.01 for the first attempt, 0.04 for the fix
    expect(run.durationMs).toBe(1800);
    expect(run.numTurns).toBe(3);
    expect(run.healAttempts).toBe(1);
    expect((run.verdict as Verdict).verdict).toBe("fail");
  }, 30_000);
});

// A Stop that landed between a verdict and the next fix attempt aborted the last attempt's controller, already spent;
// the fix attempt then ran to its end, paid for, before the run closed as cancelled.
describe.skipIf(!process.env.DATABASE_URL)("Stop between attempts", () => {
  it("closes as stopped without starting the fix attempt when Stop lands after the verdict", async () => {
    const id = await queuedRun(WS, "stopped while the check failed it");
    vi.mocked(evaluateRun)
      .mockImplementationOnce(async () => {
        await cancelRun(WS, id); // pressed while the check was failing the first attempt
        return FAIL;
      })
      .mockResolvedValue(PASS);

    await runAutomation(id);

    const [run] = await db.select().from(runs).where(eq(runs.id, id));
    expect(calls).toHaveLength(1); // the fix attempt is never paid for
    expect(run.status).toBe("cancelled");
    expect(run.error).toBe("Stopped by you");
    expect(run.verdict).toBeNull();
    expect(run.costUsd).toBeCloseTo(0.01, 10); // the first attempt's cost is kept
    expect(run.numTurns).toBe(2);
    expect(run.healAttempts).toBe(0);
    expect(await healEvents(id)).toHaveLength(0);
  }, 30_000);
});

// Each fix attempt may cost up to AgentLimits.maxBudgetUsd, and nothing checked the day's money before one.
describe.skipIf(!process.env.DATABASE_URL)("the day's budget and healing", () => {
  it("stops healing when the workspace's budget for today is spent, says so, and writes the verdict", async () => {
    vi.mocked(evaluateRun).mockResolvedValue(FAIL);
    const id = await queuedRun(BROKE_WS, "a fix the day cannot pay for");

    await runAutomation(id);

    const [run] = await db.select().from(runs).where(eq(runs.id, id));
    expect(calls).toHaveLength(1); // the fix attempt is never paid for
    expect(run.status).toBe("succeeded");
    expect((run.verdict as Verdict).verdict).toBe("fail");
    expect(run.healAttempts).toBe(0);
    const heals = (await healEvents(id)).map((e) => e.payload as { attempt: number; stopped?: string });
    expect(heals).toEqual([expect.objectContaining({ attempt: 1, stopped: "The workspace's $0.01 budget for today is spent, so healing stopped here." })]);
  }, 30_000);
});

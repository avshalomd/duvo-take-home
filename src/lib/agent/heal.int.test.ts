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
import { checkStep } from "@/lib/eval/step-check";
import { cancelRun } from "@/lib/runs/cancel";
import { runAutomation } from "./run";

const SESSION = "00000000-0000-4000-8000-00000000h3a1".replace("h", "0");
const BROKEN = 'rank,model,why\n1,a,"fine"\n2,b,small, fast\n';
const FIXED = 'rank,model,why\n1,a,"fine"\n2,b,"small, fast"\n';
const calls: { prompt: string; resume?: string }[] = [];
const hooks: { onAttempt?: (attempt: number) => Promise<void>; onResult?: () => Promise<void> } = {}; // lets a test look at the run while it heals
// How an attempt ends: its result message, no result at all (the child died mid-stream), working until aborted, or
// its result and then an abort while the child shuts down (Stop pressed just as the agent finished, qa-func F24).
type Ending = "result" | "no-result" | "hang" | "result-then-abort";
// per attempt; "result" when unset; plan: a step marked done first; fixTitle: what each fix attempt says it changed
const script: { files: string[]; endings: Ending[]; plan: boolean; fixTitle: string | null } = { files: [BROKEN, FIXED], endings: [], plan: false, fixTitle: null };
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
      if (attempt > 0 && script.fixTitle) {
        // a fix attempt names its own step instead of planning again (qa-ai F14)
        yield { type: "assistant", message: { content: [{ type: "tool_use", id: `fix-${attempt}`, name: "mcp__plan__describe_fix", input: { title: script.fixTitle } }] } };
      } else if (script.plan) {
        const steps = { intent: "a table", expectedOutputs: ["output.csv"], sources: [], steps: ["Write output.csv"] };
        yield { type: "assistant", message: { content: [
          { type: "tool_use", id: `set-${attempt}`, name: "mcp__plan__set_plan", input: steps },
          { type: "tool_use", id: `done-${attempt}`, name: "mcp__plan__update_step", input: { index: 0, status: "done" } }, // starts a step check
        ] } };
      }
      yield { type: "assistant", message: { content: [{ type: "text", text: `Attempt ${attempt + 1}: wrote output.csv.` }] } };
      const ending = script.endings[attempt] ?? "result";
      if (ending === "hang") await new Promise((_, reject) => options.abortController.signal.addEventListener("abort", () => reject(new Error("aborted"))));
      // the SDK's total for a resumed session continues from the saved one: 0.01, then 0.03 (0.02 of its own)
      if (ending === "result" || ending === "result-then-abort") yield { type: "result", subtype: "success", is_error: false, num_turns: 2, duration_ms: 1000, total_cost_usd: 0.01 * (2 * attempt + 1), result: "Wrote output.csv." };
      if (ending === "result-then-abort") {
        await hooks.onResult?.();
        await new Promise((_, reject) => options.abortController.signal.addEventListener("abort", () => reject(new Error("aborted"))));
      }
    })();
  }),
}));
vi.mock("./heal", async (importOriginal) => {
  const real = await importOriginal<typeof import("./heal")>();
  // the evaluation and the wait for step checks boxed in a fraction of a second, so a test can outwait them
  return { ...real, runBudgetMs: (mode: "inline" | "queue" | "route") => knobs.budgetMs ?? real.runBudgetMs(mode), EVAL_MAX_MS: 400, SETTLE_MAX_MS: 400 };
});
vi.mock("./stopped-cost", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stopped-cost")>()),
  readSdkTotals: vi.fn(async () => knobs.sdkTotals),
}));
vi.mock("@/lib/eval/evaluate", () => ({ evaluateRun: vi.fn() }));
vi.mock("@/lib/eval/step-check", () => ({ checkStep: vi.fn() }));
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
  hooks.onResult = undefined;
  script.files = [BROKEN, FIXED];
  script.endings = [];
  script.plan = false;
  script.fixTitle = null;
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

  // qa-ai F13: the "[e2e]" tag QA puts on its runs steered the agent ("e2e" -> end-to-end testing tools)
  it("sends the agent and the evaluator the instructions without a leading [e2e] tag, and keeps the tag on the run", async () => {
    vi.mocked(evaluateRun).mockResolvedValueOnce(PASS);
    const [row] = await db
      .insert(runs)
      .values({ prompt: "[e2e] Make me a list of the best ones.", status: "queued", model: "test", workspaceId: WS })
      .returning({ id: runs.id });

    await runAutomation(row.id);

    expect(calls[0].prompt).toBe("Make me a list of the best ones.");
    expect(vi.mocked(evaluateRun).mock.calls[0][0].prompt).toBe("Make me a list of the best ones.");
    const [run] = await db.select().from(runs).where(eq(runs.id, row.id));
    expect(run.prompt).toBe("[e2e] Make me a list of the best ones."); // QA's clean-up still finds it
  }, 30_000);

  // qa-ai F14: the plan is kept, and the fix attempt's own step carries what it changed, under its attempt
  it("keeps the plan through a fix and records the fix attempt's own step, titled by what it changed", async () => {
    vi.mocked(evaluateRun).mockResolvedValueOnce(FAIL).mockResolvedValueOnce(PASS);
    script.plan = true;
    script.fixTitle = "Put quotes around the values with a comma";
    const id = await queuedRun(WS, "a CSV whose fix is named");

    await runAutomation(id);

    const plans = (await db.select().from(runEvents).where(eq(runEvents.runId, id)).orderBy(asc(runEvents.seq))).filter((e) => e.kind === "plan");
    const last = plans.at(-1)?.payload as { steps: { title: string; status: string }[]; fixes?: { attempt: number; title: string }[] };
    expect(last.steps).toEqual([expect.objectContaining({ title: "Write output.csv", status: "done" })]);
    expect(last.fixes).toEqual([{ attempt: 1, title: "Put quotes around the values with a comma" }]);
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
// the fix attempt then ran to its end, paid for, before the run closed as cancelled. And (qa-func F24, the owner's
// call): a Stop that lands once the agent has finished must not throw its answer away - run 0d9f737e finished, was
// stopped 65 ms later, and closed cancelled with no report. Stop ends work still in progress, nothing after.
describe.skipIf(!process.env.DATABASE_URL)("Stop after the agent finished", () => {
  it("keeps the answer and its verdict, and starts no fix attempt, when Stop lands during the check", async () => {
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
    expect(run.status).toBe("succeeded"); // the agent finished: its work is the run's result
    expect(run.report).toBe("Wrote output.csv.");
    expect((run.verdict as Verdict).verdict).toBe("fail"); // the check it finished, not thrown away
    expect(run.costUsd).toBeCloseTo(0.01, 10);
    expect(run.numTurns).toBe(2);
    expect(run.healAttempts).toBe(0);
    expect(await healEvents(id)).toHaveLength(0);
    expect((await db.select().from(files).where(eq(files.runId, id))).map((f) => f.name)).toEqual(["output.csv"]);
  }, 30_000);

  it("keeps the report and files and checks them when Stop lands just after the agent's result", async () => {
    const id = await queuedRun(WS, "stopped as the agent finished");
    script.endings = ["result-then-abort"];
    hooks.onResult = async () => void (await cancelRun(WS, id)); // Stop, 65 ms after the result in the real run
    vi.mocked(evaluateRun).mockResolvedValue(PASS);

    await runAutomation(id);

    const [run] = await db.select().from(runs).where(eq(runs.id, id));
    expect(run.status).toBe("succeeded");
    expect(run.error).toBeNull();
    expect(run.report).toBe("Wrote output.csv.");
    expect((run.verdict as Verdict).verdict).toBe("pass");
    expect(vi.mocked(evaluateRun)).toHaveBeenCalledOnce();
    expect((await db.select().from(files).where(eq(files.runId, id))).map((f) => f.name)).toEqual(["output.csv"]);
  }, 30_000);

  it("still closes as stopped, with no fix attempt, when Stop lands while a fix attempt works", async () => {
    const id = await queuedRun(WS, "stopped during the fix");
    script.endings = ["result", "hang"];
    hooks.onAttempt = async (attempt) => void (attempt === 1 ? await cancelRun(WS, id) : undefined);
    vi.mocked(evaluateRun).mockResolvedValue(FAIL);

    await runAutomation(id);

    const [run] = await db.select().from(runs).where(eq(runs.id, id));
    expect(calls).toHaveLength(2);
    expect(run.status).toBe("cancelled"); // the fix was work in progress: Stop ends it
    expect(run.error).toBe("Stopped by you");
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

// Inline or in the runner route a run lives in one function call, which Vercel ends at 300 s whatever it is doing: a
// run still waiting on its judge or its step checks then stayed "evaluating" for ever. Both waits are boxed.
describe.skipIf(!process.env.DATABASE_URL)("what follows the agent is boxed in time", () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const kinds = async (runId: string) => (await db.select().from(runEvents).where(eq(runEvents.runId, runId))).map((e) => e.kind);

  it("closes the run as not checked, never as a pass, when the check takes too long", async () => {
    vi.mocked(evaluateRun).mockReturnValue(new Promise(() => {})); // a judge that never answers
    const id = await queuedRun(WS, "a judge that never answers");

    await runAutomation(id);

    const [run] = await db.select().from(runs).where(eq(runs.id, id));
    expect(run.status).toBe("succeeded"); // the agent's work stands
    expect(run.finishedAt).not.toBeNull();
    const v = run.verdict as Verdict;
    expect(v.verdict).toBe("unknown");
    expect(v.reasons).toEqual(["Not checked: the check took too long; press Re-evaluate to try again"]);
  }, 30_000);

  it("closes the run without waiting on a step check still out, and never writes that check after", async () => {
    script.plan = true;
    const late = { stepIndex: 0, onTrack: 0.9, note: "Done." };
    vi.mocked(checkStep).mockImplementation(() => new Promise((r) => setTimeout(() => r(late), 2000)));
    vi.mocked(evaluateRun).mockResolvedValue(PASS);
    const id = await queuedRun(WS, "a step check that answers late");

    await runAutomation(id);
    const [run] = await db.select().from(runs).where(eq(runs.id, id));
    expect(run.status).toBe("succeeded");
    expect(await kinds(id)).toContain("plan");
    await sleep(2500); // the check answers now, after the run closed

    expect(await kinds(id)).not.toContain("check");
  }, 30_000);
});

import "server-only";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { and, eq } from "drizzle-orm";
import { db, transaction } from "@/db";
import { files as filesTable, runEvents, runs } from "@/db/schema";
import { AgentLimits, type RunAutomation } from "@/contracts/agent";
import type { AutomationTemplate } from "@/contracts/automation";
import type { Verdict } from "@/contracts/eval";
import type { GuardRecord } from "@/contracts/guard";
import type { OutputFile } from "@/contracts/outputs";
import type { Plan, RunEvent } from "@/contracts/run";
import { getAutomation } from "@/lib/automations/store";
import { fillTemplate } from "@/lib/automations/template";
import { listEnabledConnectionsWithSecrets, recordConnectionSeen } from "@/lib/connections/store";
import { connectionKey } from "@/lib/connections/key";
import { authHeaders } from "@/lib/connections/oauth";
import { evaluateRun } from "@/lib/eval/evaluate";
import { feedbackForAgent, isHealable } from "@/lib/eval/feedback";
import { checkStep } from "@/lib/eval/step-check";
import { collectFiles } from "@/lib/outputs/collect";
import { createOutputsServer, OUTPUTS_SERVER_KEY } from "@/lib/outputs/server";
import { runnerMode } from "@/lib/runner/mode";
import { getLimits, healBudgetStop } from "@/lib/usage/budget";
import { AUTOMATION_GONE, automationRunRefusal } from "./automation-check";
import { watchCancel } from "./cancel-watch";
import { childEnv, ISOLATION } from "./child-env";
import { closeAsCancelled, updateUnlessCancelled } from "./close";
import { reachableConnections } from "./connection-reach";
import { statusUpdates } from "./connection-status";
import { startDeadline, within } from "./deadline";
import { prepareFollowUp } from "./follow-up";
import { buildGuardHooks } from "./guards";
import { attemptFingerprint, EVAL_MAX_MS, healPrompt, noProgress, runBudgetMs, SETTLE_MAX_MS, shouldHeal, type AttemptFingerprint } from "./heal";
import { scanOutput } from "./guards/scan";
import { createMapper } from "./map-message";
import { tripwireReason, unexpectedServers } from "./mcp-tripwire";
import { newlyDone } from "./plan-diff";
import { PLAN_SERVER_KEY } from "./plan-state";
import { createPlanServer } from "./plan-tool";
import { resumeOptions, sessionIdOf } from "./session";
import { ownCost, readSdkTotals, runTotals, stoppedTotals, withAttemptCost } from "./stopped-cost";
import { SYSTEM_PROMPT } from "./system.prompt";
import { unknownVerdict } from "./unknown-verdict";
import { removeRunDir } from "./workspace";

export const AGENT_MODEL = process.env.AGENT_MODEL ?? "claude-sonnet-5";
const NATIVE_TOOLS = ["WebSearch", "WebFetch", "Read", "Write"]; // everything else is removed below
const CANCEL_POLL_MS = 2000; // Stop is felt within 2 s, at one tiny read per run every 2 s
const EVAL_TOO_LONG = "the check took too long; press Re-evaluate to try again"; // read as "Not checked: ..."

/** One working directory per run, gitignored; bypassPermissions lets the agent write anywhere under it.
 *  On Vercel the code directory is read-only, so the run lives under the function's temp dir instead. */
export const runDir = (runId: string) => path.join(process.env.VERCEL ? os.tmpdir() : process.cwd(), "runs", runId);

/**
 * The workspace's enabled connections as MCP servers, keyed so their tools arrive as mcp__<key>__<tool>. One whose
 * address now leads inside our network (or cannot be looked up) is left out, and its status says why.
 */
async function connectionServers(workspaceId: string) {
  const { usable: enabled, leftOut } = await reachableConnections(await listEnabledConnectionsWithSecrets(workspaceId));
  for (const c of leftOut) await recordConnectionSeen(c.id, { lastStatus: c.lastStatus });
  const servers: Record<string, { type: "http" | "sse"; url: string; headers?: Record<string, string> }> = {};
  for (const c of enabled) {
    servers[connectionKey(c.name)] = { type: c.transport, url: c.url, headers: await authHeaders(c) }; // the token never leaves the server
  }
  return { enabled, servers };
}

/** Has the user pressed Stop on this run? The cancel watch asks every 2 s. */
async function cancelRequested(runId: string): Promise<boolean> {
  const [row] = await db.select({ at: runs.cancelRequestedAt }).from(runs).where(eq(runs.id, runId));
  return row?.at != null;
}

/**
 * The whole loop for one run: spawn the agent, record every message it sends as a run_events row, collect the
 * files it wrote, evaluate the result and close the run. It is the only writer of a run's rows. Every way out -
 * success, failure, the wall clock, Stop - closes the run, and "cancelled" is never overwritten once written.
 */
export const runAutomation: RunAutomation = async (runId) => {
  // Claim the run, queued -> running, in one statement. A run that is no longer queued - stopped while it waited,
  // or already taken by another worker - is left alone: a cancelled run never starts and no run starts twice.
  const [run] = await db
    .update(runs)
    .set({ status: "running" })
    .where(and(eq(runs.id, runId), eq(runs.status, "queued")))
    .returning();
  if (!run) {
    console.warn(`run ${runId} is not queued any more; not started`);
    return;
  }
  const workspaceId = run.workspaceId ?? "";
  const startedAt = Date.now(); // a stopped run with no totals from the SDK records at least this much time

  // Everything before the first message can fail too (a read-only disk, a bad connection row): a run must never
  // stay "running" with no reason, so these steps close the run as failed like the loop below does.
  const dir = runDir(runId);
  let enabled: Awaited<ReturnType<typeof connectionServers>>["enabled"];
  let servers: Awaited<ReturnType<typeof connectionServers>>["servers"];
  let limits: Awaited<ReturnType<typeof getLimits>>;
  let systemPrompt = SYSTEM_PROMPT;
  let template: AutomationTemplate | null = null;
  let prompt = run.prompt; // what the agent is sent
  let instructions = run.prompt; // what the step checks and the evaluator judge the result against
  let resume: Awaited<ReturnType<typeof resumeOptions>> = null;
  let costBase = 0; // a resumed follow-up's SDK total starts from its parent's: only the rest is this run's cost
  try {
    if (run.automationId) {
      // A saved automation's run keeps to its template: the system prompt says so, the evaluator checks it. First,
      // the template must still be the version the run was started at (and approved, for a command or schedule):
      // otherwise the run fails here, before the agent starts, with the reason (QA Q82).
      const automation = await getAutomation(workspaceId, run.automationId);
      const refusal = automationRunRefusal(run, automation);
      if (refusal || !automation) throw new Error(refusal ?? AUTOMATION_GONE);
      template = automation.template;
      const addendum = fillTemplate(automation, run.input ?? "").systemAddendum;
      if (addendum) systemPrompt = `${SYSTEM_PROMPT}\n\n${addendum}`;
    }
    await mkdir(dir, { recursive: true });
    ({ enabled, servers } = await connectionServers(workspaceId));
    limits = await getLimits(workspaceId);
    if (run.parentRunId) {
      // "Ask for a change": the parent's files go back into the directory and its conversation is continued.
      ({ prompt, instructions, resume, costBase } = await prepareFollowUp(run, dir));
    }
    await db.update(runs).set({ connectionIds: enabled.map((c) => c.id) }).where(eq(runs.id, runId));
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await updateUnlessCancelled(runId, { status: "failed", error, finishedAt: new Date() });
    await removeRunDir(dir); // this branch returns, so the try/finally below never sees it
    return;
  }

  const map = createMapper(); // one mapper for every attempt: the plan and the turn count carry on across heals
  let seq = 1;
  const recorded: RunEvent[] = []; // kept so the closing update reads the plan and the result from the same events
  let plan: Plan | null = null;
  const checks = new Set<Promise<void>>(); // the per-step checks still waiting on Jev

  // One writer, in order: the agent's messages, the guards' decisions and the step checks all arrive here, from
  // different callbacks, and each gets the next seq only when it is written.
  let chain: Promise<void> = Promise.resolve();
  const write = (events: Omit<RunEvent, "seq">[]) => {
    chain = chain.then(async () => {
      for (const raw of events) {
        const e = { ...raw, seq: seq++ } as RunEvent;
        await db.insert(runEvents).values({ runId, seq: e.seq, kind: e.kind, payload: e.payload, at: new Date(e.at) });
        recorded.push(e);
        if (e.kind === "started") {
          // the init message is where a connection's real status shows up; write it back so the list stops guessing
          for (const u of statusUpdates(e.payload.mcp_servers, enabled)) {
            const key = connectionKey(enabled.find((c) => c.id === u.id)?.name ?? "");
            const tools = e.payload.tools.filter((t) => t.startsWith(`mcp__${key}__`)).map((t) => t.slice(`mcp__${key}__`.length));
            await recordConnectionSeen(u.id, { lastStatus: u.lastStatus, tools });
          }
        }
        if (e.kind === "plan") {
          const before = plan;
          plan = e.payload;
          if (limits.stepChecks) for (const i of newlyDone(before, e.payload)) track(stepCheck(e.payload, i));
        }
      }
    });
    return chain;
  };
  const now = () => new Date().toISOString();

  // settle() ends a round: a check begun in an earlier round that answers after it gave up waiting is dropped, so no
  // event is ever written after the run has closed.
  let round = 0;

  // The per-step check runs beside the agent, never in its way: a slow or failed Jev call records nothing, and
  // nothing in here may throw - an unhandled rejection would take the whole worker process down with it.
  const stepCheck = async (p: Plan, stepIndex: number) => {
    const mine = round;
    try {
      const startedAt = recorded.findLastIndex((e) => e.kind === "plan" && e.payload.steps[stepIndex]?.status === "running");
      const calls = recorded
        .slice(Math.max(0, startedAt))
        .flatMap((e) => (e.kind === "tool_call" ? [{ name: e.payload.name, input: e.payload.input }] : []));
      const check = await checkStep({ prompt: instructions, plan: p, stepIndex, calls });
      if (mine !== round) return; // too late: settle() stopped waiting for it, and the run may be closed by now
      await write([{ kind: "check", payload: check, at: now() }]);
    } catch {
      // no check event: the stepper shows the step without a mark
    }
  };
  const track = (p: Promise<void>) => {
    checks.add(p);
    void p.finally(() => checks.delete(p));
  };
  // Before the run goes on: the checks still in flight land, for at most SETTLE_MAX_MS (a function's 300 s has no
  // room to wait longer), then every queued write is in.
  const settle = async () => {
    await within(Promise.allSettled([...checks]), SETTLE_MAX_MS, () => []);
    round += 1;
    await chain;
  };

  const recordGuard = async (r: GuardRecord) => {
    await write([{ kind: "guard", payload: r, at: now() }]);
  };

  // The wall clock the SDK does not keep: turns and budget cannot stop a tool that simply hangs. Every attempt gets
  // its own (an aborted controller cannot be reused), cut to what is left of the run's budget. Stop aborts the
  // current one, so the SDK sees one abort and the catch below tells the causes apart.
  const budgetEndsAt = startedAt + runBudgetMs(runnerMode());
  const attemptMs = () => Math.min(AgentLimits.wallClockMs, Math.max(0, budgetEndsAt - Date.now()));
  let deadline = startDeadline(attemptMs());
  const cancel = watchCancel({ isRequested: () => cancelRequested(runId), controller: { abort: () => deadline.controller.abort() }, everyMs: CANCEL_POLL_MS });
  const outputs = createOutputsServer(dir);
  const connectionNames = Object.fromEntries(enabled.map((c) => [connectionKey(c.name), c.name]));

  // The run's files are what is in its directory now: stored after every attempt, replacing the rows before, so an
  // auto-heal's fixed file is never listed beside the broken one. One transaction, so a reader never sees none.
  const storeFiles = async (): Promise<OutputFile[]> => {
    const found = await collectFiles(dir);
    const rows = found.map((f) => ({ runId, ...f, ...scanOutput(f) }));
    await transaction(async (tx) => {
      await tx.delete(filesTable).where(eq(filesTable.runId, runId));
      if (rows.length) await tx.insert(filesTable).values(rows);
    });
    return found;
  };

  // Auto-heal (his call, 2026-09-23): the attempts of this one run, and what the finished ones cost together.
  let heals = 0;
  const spent = { usd: 0, ms: 0, turns: 0 }; // the attempts whose result is in
  let lastVerdict: Verdict | null = null; // written to runs.verdict once, when the run's tries are over
  const earlierAttempts: AttemptFingerprint[] = []; // what each failed attempt left, to see an attempt go round again
  let attemptBase = costBase; // what this attempt's SDK total starts from (a resumed session carries the last total)
  let attemptStartedAt = startedAt;
  let attemptFrom = 0; // where this attempt's events begin in `recorded`
  let turnsBefore = 0; // the mapper's turn count when this attempt began
  let counted = false; // this attempt's result is already in `spent`
  const maxTurn = (events: RunEvent[]) => Math.max(0, ...events.map((e) => Number((e.payload as { turn?: unknown }).turn) || 0));
  const attemptResult = () => recorded.slice(attemptFrom).find((e) => e.kind === "finished")?.payload ?? null;

  // A run closed early keeps what it cost (QA Q129) - stopped, cut off by the wall clock, tripped, or a child that
  // died: the finished attempts, plus the one in progress - its result's figures when the agent had finished, else the
  // SDK's own totals from its transcript, else the time from the attempt's start to now.
  let sessionId: string | null = null;
  const totalsSoFar = async () => {
    if (counted) return runTotals(spent, null);
    const end = attemptResult();
    const sdk = end || !sessionId ? null : await readSdkTotals(sessionId);
    return runTotals(spent, stoppedTotals({ end, sdk, startedAt: attemptStartedAt, now: Date.now(), turns: maxTurn(recorded) - turnsBefore, costBase: attemptBase }));
  };
  const closeStopped = async () => {
    await closeAsCancelled(runId, { ...(await totalsSoFar()), healAttempts: heals });
  };

  // The MCP servers this run may see: ours, and the workspace's enabled connections. Anything else trips the wire.
  const allowedServers = [PLAN_SERVER_KEY, OUTPUTS_SERVER_KEY, ...Object.keys(servers)];
  let tripped: string | null = null;

  /** One attempt: the agent works (or fixes its work) until its result message, every message recorded as it comes. */
  const runAttempt = async (attemptPrompt: string, attemptResume: { resume: string; forkSession?: boolean } | null) => {
    attemptStartedAt = Date.now();
    attemptFrom = recorded.length; // the previous attempt settled, so every one of its events is in
    turnsBefore = maxTurn(recorded);
    counted = false;
    const q = query({
      prompt: attemptPrompt,
      options: {
        cwd: dir,
        ...ISOLATION, // no settings files, only the MCP servers below, no claude.ai connectors (QA Q134)
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        abortController: deadline.controller,
        tools: NATIVE_TOOLS, // the child's built-in tool set; MCP tools are added by mcpServers and are not in it
        allowedTools: [
          ...NATIVE_TOOLS,
          `mcp__${PLAN_SERVER_KEY}__*`,
          `mcp__${OUTPUTS_SERVER_KEY}__*`,
          ...Object.keys(servers).map((k) => `mcp__${k}__*`),
        ],
        disallowedTools: ["Bash", "Edit", "Task", "Glob", "Grep", "NotebookEdit"], // allowedTools approves, only this restricts
        // Permissions are bypassed, so the guards are what stop a fetched page from talking the agent into reading
        // .env.local or posting the task's data to a third party. Each decision is recorded as a guard event.
        hooks: buildGuardHooks({
          runId,
          dir,
          deniedDomains: limits.deniedDomains,
          strictConnections: limits.strictConnections,
          connectionNames,
          plan: () => plan,
          record: recordGuard,
        }),
        maxTurns: AgentLimits.maxTurns, // per attempt, like the budget: each query has its own
        maxBudgetUsd: AgentLimits.maxBudgetUsd,
        model: AGENT_MODEL,
        systemPrompt, // a plain string replaces Claude Code's large preset prompt
        // The user's servers first and ours last: a connection keyed "plan" or "outputs" must never replace our own tools.
        mcpServers: { ...servers, [PLAN_SERVER_KEY]: createPlanServer(), [OUTPUTS_SERVER_KEY]: outputs },
        env: childEnv(process.env), // env REPLACES the child's environment: an allowlist, never the parent's session or keys
        ...attemptResume, // a follow-up resumes its parent's session; a heal resumes this run's own
      },
    });

    for await (const message of q) {
      const id = sessionIdOf(message);
      if (id) {
        sessionId = id;
        await db.update(runs).set({ sessionId }).where(eq(runs.id, runId)); // what a follow-up or a heal resumes
      }
      const events = withAttemptCost(map(message, 0, now()), attemptBase); // each attempt's own cost, for Details
      await write(events);
      // The tripwire: a tool source in init that is neither ours nor the workspace's stops the run before the agent
      // can call it, whatever let it in (QA Q134).
      const started = events.find((e) => e.kind === "started");
      const foreign = started ? unexpectedServers(started.payload.mcp_servers.map((s) => s.name), allowedServers) : [];
      if (foreign.length) {
        tripped = tripwireReason(foreign);
        deadline.controller.abort();
        break;
      }
    }
    deadline.clear(); // the stream is done; nothing left to abort
    if (tripped) throw new Error(tripped);
    await settle();
  };

  // Everything from here to the closing update is inside one try: a failure in the file collection, the evaluator
  // or a database write used to leave the run "running" or "evaluating" for ever with nobody to close it.
  try {
    // What the next attempt is sent; for a fix, also what its heal event says, written only once the fix starts.
    let next: { prompt: string; resume: { resume: string; forkSession?: boolean } | null; heal: { reasons: string[]; feedback: string } | null } = {
      prompt,
      resume,
      heal: null,
    };
    for (;;) {
      // The attempt's controller first, then the stop check. A Stop the watch saw before this line aborted the last
      // attempt's controller, already spent, and is caught here; one it sees after aborts this one. A Stop pressed but
      // not polled yet is read here too: no attempt starts, and none is paid for, on a run the user stopped.
      deadline.clear();
      deadline = startDeadline(attemptMs());
      if (cancel.cancelled() || (await cancelRequested(runId))) {
        await closeStopped();
        return;
      }
      if (next.heal) {
        heals += 1;
        await write([{ kind: "heal", payload: { attempt: heals, max: limits.autoHealAttempts, ...next.heal }, at: now() }]);
        await updateUnlessCancelled(runId, { status: "running", healAttempts: heals });
      }
      await runAttempt(next.prompt, next.resume);
      const written = await storeFiles();

      // An abort can end the stream quietly instead of throwing: Stop is then seen here.
      if (cancel.cancelled()) {
        await closeStopped();
        return;
      }
      const end = attemptResult();
      // No result message means the child died mid-stream. That is a failure, not a success with no report.
      if (!end) throw new Error("the agent ended without a result");
      spent.usd += ownCost(end.total_cost_usd, attemptBase);
      spent.ms += end.duration_ms;
      spent.turns += end.num_turns;
      counted = true;
      await updateUnlessCancelled(runId, {
        status: "evaluating", // visible while the judge runs: the agent is done but the verdict is not
        report: end.result || null,
        error: end.is_error ? end.result || end.subtype : null, // the provider's words when the SDK sent any
        numTurns: spent.turns,
        durationMs: spent.ms,
        costUsd: spent.usd, // every attempt of the run, each counted once
      });

      // An evaluator failure must not lose the run the agent already did, and must not look like a pass either:
      // the run is stored as "not checked" with the reason, which Re-evaluate can then show (QA Q59). So is an
      // evaluation that takes longer than EVAL_MAX_MS: the function would be ended with the run left open.
      const judged = evaluateRun({
        prompt: instructions,
        runStatus: end.is_error ? "failed" : "succeeded",
        report: end.result || null,
        plan: (recorded.filter((e) => e.kind === "plan").at(-1)?.payload ?? null) as Plan | null,
        // every file as stored, base64 included: the evaluator decides what the judge sees (eval/file-view.ts), and its
        // spreadsheet check needs the bytes to confirm the .xlsx header
        files: written.map((f) => ({ name: f.name, content: f.content })),
        today: new Date().toISOString().slice(0, 10),
        // the tools the run actually called: "claimed a connection but never used it" is a code check, not a judge call
        toolsUsed: [...new Set(recorded.filter((e) => e.kind === "tool_call").map((e) => e.payload.name))],
        template,
      }).catch(unknownVerdict);
      const evaluation = within(judged, EVAL_MAX_MS, () => unknownVerdict(new Error(EVAL_TOO_LONG)));
      // Stop during the evaluation wins the race: the judge cannot be aborted, so its answer is simply dropped.
      const verdict = await Promise.race([evaluation, cancel.whenCancelled.then(() => null)]);
      if (verdict === null || cancel.cancelled()) {
        await closeStopped(); // the attempts' cost, turns and duration; no verdict
        return;
      }
      lastVerdict = verdict;

      // Auto-heal: a result the agent can fix goes back to the same session with the findings, inside this run. The
      // failing verdict lives only in the heal event; runs.verdict waits until the tries are over (his words: "the
      // run should say pass or fail only if all the auto-heal tries are exhausted").
      const heal = shouldHeal({
        healable: isHealable(verdict, !end.is_error),
        healsSoFar: heals,
        limit: limits.autoHealAttempts,
        remainingMs: budgetEndsAt - Date.now(),
      });
      const close = () => updateUnlessCancelled(runId, { status: end.is_error ? "failed" : "succeeded", verdict, healAttempts: heals, finishedAt: new Date() });
      if (!heal) {
        await close();
        return;
      }
      const feedback = feedbackForAgent(verdict);
      // No further attempt when it would only go round again (QA Q148: the same files or the same failure as an earlier
      // attempt), or when the workspace's money for today is spent: a fix attempt may cost up to maxBudgetUsd, and the
      // check at the start saw none of it. The stop is recorded where the heals are, and the verdict is written now.
      const print = attemptFingerprint(verdict, written);
      const stopped = noProgress(print, earlierAttempts) ?? (await healBudgetStop(workspaceId, runId, spent.usd));
      if (stopped) {
        await write([{ kind: "heal", payload: { attempt: heals + 1, max: limits.autoHealAttempts, reasons: verdict.reasons, feedback, stopped }, at: now() }]);
        await close();
        return;
      }
      earlierAttempts.push(print);
      // The same session, not a fork: the run stays one conversation. Where it is gone, the heal prompt carries the
      // instructions too, and the new session's total starts from nothing.
      const same = sessionId ? await resumeOptions(sessionId) : null;
      attemptBase = same ? end.total_cost_usd : 0;
      next = {
        prompt: same ? healPrompt(feedback) : `${prompt}\n\n${healPrompt(feedback)}`,
        resume: same ? { resume: same.resume } : null,
        heal: { reasons: verdict.reasons, feedback },
      };
    }
  } catch (err) {
    await settle().catch(() => undefined);
    if (cancel.cancelled()) {
      // Stopped by the user: what the agent wrote so far is kept (and scanned like any other file), with no verdict.
      await storeFiles().catch((e) => console.error(`run ${runId}: files of a stopped run not stored`, e));
      await closeStopped();
      return;
    }
    // An abort reads as a generic "aborted" error, so say which limit ended the run; the tripwire's own reason first.
    let error = err instanceof Error ? err.message : String(err);
    if (deadline.expired()) error = `timed out after ${Math.round((Date.now() - startedAt) / 1000)} s`;
    if (tripped) error = tripped;
    // A heal attempt that failed leaves the last verdict as the run's: its tries are over. What every attempt cost is
    // recorded too, so the day's budget counts a failed run like any other.
    const totals = await totalsSoFar();
    await updateUnlessCancelled(runId, { status: "failed", error, verdict: lastVerdict, healAttempts: heals, ...totals, finishedAt: new Date() });
  } finally {
    deadline.clear();
    cancel.stop();
    // The files that matter are rows in the database by now, so the working directory is rubbish either way;
    // on Vercel /tmp survives between invocations and would fill up (QA Q58).
    await removeRunDir(dir);
  }
};

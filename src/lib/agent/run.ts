import "server-only";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { files as filesTable, runEvents, runs } from "@/db/schema";
import { AgentLimits, type RunAutomation } from "@/contracts/agent";
import type { AutomationTemplate } from "@/contracts/automation";
import type { GuardRecord } from "@/contracts/guard";
import type { OutputFile } from "@/contracts/outputs";
import type { Plan, RunEvent } from "@/contracts/run";
import { getAutomation } from "@/lib/automations/store";
import { fillTemplate } from "@/lib/automations/template";
import { listEnabledConnectionsWithSecrets, recordConnectionSeen } from "@/lib/connections/store";
import { connectionKey } from "@/lib/connections/key";
import { authHeaders } from "@/lib/connections/oauth";
import { evaluateRun } from "@/lib/eval/evaluate";
import { checkStep } from "@/lib/eval/step-check";
import { collectFiles } from "@/lib/outputs/collect";
import { createOutputsServer, OUTPUTS_SERVER_KEY } from "@/lib/outputs/server";
import { getLimits } from "@/lib/usage/budget";
import { watchCancel } from "./cancel-watch";
import { closeAsCancelled, updateUnlessCancelled } from "./close";
import { statusUpdates } from "./connection-status";
import { startDeadline } from "./deadline";
import { prepareFollowUp } from "./follow-up";
import { buildGuardHooks } from "./guards";
import { scanOutput } from "./guards/scan";
import { createMapper } from "./map-message";
import { newlyDone } from "./plan-diff";
import { createPlanServer } from "./plan-tool";
import { resumeOptions, sessionIdOf } from "./session";
import { SYSTEM_PROMPT } from "./system.prompt";
import { unknownVerdict } from "./unknown-verdict";
import { removeRunDir } from "./workspace";

export const AGENT_MODEL = process.env.AGENT_MODEL ?? "claude-sonnet-5";
const NATIVE_TOOLS = ["WebSearch", "WebFetch", "Read", "Write"]; // everything else is removed below
const CANCEL_POLL_MS = 2000; // Stop is felt within 2 s, at one tiny read per run every 2 s

/** One working directory per run, gitignored; bypassPermissions lets the agent write anywhere under it.
 *  On Vercel the code directory is read-only, so the run lives under the function's temp dir instead. */
export const runDir = (runId: string) => path.join(process.env.VERCEL ? os.tmpdir() : process.cwd(), "runs", runId);

/** The workspace's enabled connections as MCP servers, keyed so their tools arrive as mcp__<key>__<tool>. */
async function connectionServers(workspaceId: string) {
  const enabled = await listEnabledConnectionsWithSecrets(workspaceId);
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
  try {
    await mkdir(dir, { recursive: true });
    ({ enabled, servers } = await connectionServers(workspaceId));
    limits = await getLimits(workspaceId);
    if (run.automationId) {
      // A saved automation's run keeps to its template: the system prompt says so, the evaluator checks it.
      const automation = await getAutomation(workspaceId, run.automationId);
      if (automation) {
        template = automation.template;
        const addendum = fillTemplate(automation, run.input ?? "").systemAddendum;
        if (addendum) systemPrompt = `${SYSTEM_PROMPT}\n\n${addendum}`;
      }
    }
    if (run.parentRunId) {
      // "Ask for a change": the parent's files go back into the directory and its conversation is continued.
      ({ prompt, instructions, resume } = await prepareFollowUp(run, dir));
    }
    await db.update(runs).set({ connectionIds: enabled.map((c) => c.id) }).where(eq(runs.id, runId));
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await updateUnlessCancelled(runId, { status: "failed", error, finishedAt: new Date() });
    await removeRunDir(dir); // this branch returns, so the try/finally below never sees it
    return;
  }

  const map = createMapper();
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

  // The per-step check runs beside the agent, never in its way: a slow or failed Jev call records nothing, and
  // nothing in here may throw - an unhandled rejection would take the whole worker process down with it.
  const stepCheck = async (p: Plan, stepIndex: number) => {
    try {
      const startedAt = recorded.findLastIndex((e) => e.kind === "plan" && e.payload.steps[stepIndex]?.status === "running");
      const calls = recorded
        .slice(Math.max(0, startedAt))
        .flatMap((e) => (e.kind === "tool_call" ? [{ name: e.payload.name, input: e.payload.input }] : []));
      const check = await checkStep({ prompt: instructions, plan: p, stepIndex, calls });
      await write([{ kind: "check", payload: check, at: now() }]);
    } catch {
      // no check event: the stepper shows the step without a mark
    }
  };
  const track = (p: Promise<void>) => {
    checks.add(p);
    void p.finally(() => checks.delete(p));
  };
  // Before the run closes: the checks still in flight land, then every queued write is in.
  const settle = async () => {
    await Promise.allSettled([...checks]);
    await chain;
  };

  const recordGuard = async (r: GuardRecord) => {
    await write([{ kind: "guard", payload: r, at: now() }]);
  };

  // The wall clock the SDK does not keep: turns and budget cannot stop a tool that simply hangs. Stop aborts the
  // same controller, so the SDK sees one abort and the catch below tells the two apart.
  const deadline = startDeadline(AgentLimits.wallClockMs);
  const cancel = watchCancel({ isRequested: () => cancelRequested(runId), controller: deadline.controller, everyMs: CANCEL_POLL_MS });
  const outputs = createOutputsServer(dir);
  const connectionNames = Object.fromEntries(enabled.map((c) => [connectionKey(c.name), c.name]));

  // The files are stored once, whichever way the run ends: a stopped run keeps what the agent wrote so far.
  let stored: OutputFile[] | null = null;
  const storeFiles = async (): Promise<OutputFile[]> => {
    if (stored) return stored;
    const found = await collectFiles(dir);
    if (found.length) await db.insert(filesTable).values(found.map((f) => ({ runId, ...f, ...scanOutput(f) })));
    stored = found;
    return found;
  };

  // Everything from here to the closing update is inside one try: a failure in the file collection, the evaluator
  // or a database write used to leave the run "running" or "evaluating" for ever with nobody to close it.
  try {
    const q = query({
      prompt,
      options: {
        cwd: dir,
        settingSources: [], // never load this repo's or the user's settings into the child (hooks, CLAUDE.md)
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        abortController: deadline.controller,
        tools: NATIVE_TOOLS, // the child's built-in tool set; MCP tools are added by mcpServers and are not in it
        allowedTools: [
          ...NATIVE_TOOLS,
          "mcp__plan__*",
          ...(outputs ? [`mcp__${OUTPUTS_SERVER_KEY}__*`] : []),
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
        maxTurns: AgentLimits.maxTurns,
        maxBudgetUsd: AgentLimits.maxBudgetUsd,
        model: AGENT_MODEL,
        systemPrompt, // a plain string replaces Claude Code's large preset prompt
        mcpServers: { plan: createPlanServer(), ...(outputs ? { [OUTPUTS_SERVER_KEY]: outputs } : {}), ...servers },
        env: { ...process.env }, // env REPLACES the child's environment: without the spread it has no API key
        ...resume, // a follow-up: { resume, forkSession } when the parent's session is still on this machine
      },
    });

    for await (const message of q) {
      const sessionId = sessionIdOf(message);
      if (sessionId) await db.update(runs).set({ sessionId }).where(eq(runs.id, runId)); // what a follow-up resumes
      await write(map(message, 0, now()));
    }
    deadline.clear(); // the stream is done; nothing left to abort
    await settle();
    const written = await storeFiles();

    // An abort can end the stream quietly instead of throwing: Stop is then seen here.
    if (cancel.cancelled()) {
      await closeAsCancelled(runId);
      return;
    }
    const end = recorded.find((e) => e.kind === "finished")?.payload;
    // No result message means the child died mid-stream. That is a failure, not a success with no report.
    if (!end) throw new Error("the agent ended without a result");
    const finalPlan = (recorded.filter((e) => e.kind === "plan").at(-1)?.payload ?? null) as Plan | null;
    await updateUnlessCancelled(runId, {
      status: "evaluating", // visible while the judge runs: the run is done but the verdict is not
      report: end.result || null,
      error: end.is_error ? end.result || end.subtype : null, // the provider's words when the SDK sent any
      numTurns: end.num_turns,
      durationMs: end.duration_ms,
      costUsd: end.total_cost_usd,
    });

    // An evaluator failure must not lose the run the agent already did, and must not look like a pass either:
    // the run is stored as "not checked" with the reason, which Re-evaluate can then show (QA Q59).
    const evaluation = evaluateRun({
      prompt: instructions,
      runStatus: end.is_error ? "failed" : "succeeded",
      report: end.result || null,
      plan: finalPlan,
      // a binary file (.xlsx) is judged by its name and size: base64 would tell the judge nothing
      files: written.map((f) => ({ name: f.name, content: f.encoding === "utf8" ? f.content : `(${f.mime}, ${f.bytes} bytes)` })),
      today: new Date().toISOString().slice(0, 10),
      // the tools the run actually called: "claimed a connection but never used it" is a code check, not a judge call
      toolsUsed: [...new Set(recorded.filter((e) => e.kind === "tool_call").map((e) => e.payload.name))],
      template,
    }).catch(unknownVerdict);
    // Stop during the evaluation wins the race: the judge cannot be aborted, so its answer is simply dropped.
    const verdict = await Promise.race([evaluation, cancel.whenCancelled.then(() => null)]);
    if (verdict === null || cancel.cancelled()) {
      await closeAsCancelled(runId); // keeps the report, turns and cost written above; no verdict
      return;
    }

    await updateUnlessCancelled(runId, { status: end.is_error ? "failed" : "succeeded", verdict, finishedAt: new Date() });
  } catch (err) {
    await settle().catch(() => undefined);
    if (cancel.cancelled()) {
      // Stopped by the user: what the agent wrote so far is kept (and scanned like any other file), with no verdict.
      await storeFiles().catch((e) => console.error(`run ${runId}: files of a stopped run not stored`, e));
      await closeAsCancelled(runId);
      return;
    }
    // An abort reads as a generic "aborted" error, so say which limit ended the run.
    const error = deadline.expired()
      ? `timed out after ${Math.round(AgentLimits.wallClockMs / 1000)} s`
      : err instanceof Error
        ? err.message
        : String(err);
    await updateUnlessCancelled(runId, { status: "failed", error, finishedAt: new Date() });
  } finally {
    deadline.clear();
    cancel.stop();
    // The files that matter are rows in the database by now, so the working directory is rubbish either way;
    // on Vercel /tmp survives between invocations and would fill up (QA Q58).
    await removeRunDir(dir);
  }
};

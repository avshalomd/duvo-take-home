import "server-only";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { files as filesTable, runEvents, runs } from "@/db/schema";
import { AgentLimits, type RunAutomation } from "@/contracts/agent";
import type { AutomationTemplate } from "@/contracts/automation";
import type { GuardRecord } from "@/contracts/guard";
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
import { statusUpdates } from "./connection-status";
import { startDeadline } from "./deadline";
import { buildGuardHooks } from "./guards";
import { scanOutput } from "./guards/scan";
import { createMapper } from "./map-message";
import { createPlanServer } from "./plan-tool";
import { SYSTEM_PROMPT } from "./system.prompt";
import { unknownVerdict } from "./unknown-verdict";
import { removeRunDir } from "./workspace";

export const AGENT_MODEL = process.env.AGENT_MODEL ?? "claude-sonnet-5";
const NATIVE_TOOLS = ["WebSearch", "WebFetch", "Read", "Write"]; // everything else is removed below

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

/** The step indexes that turned "done" between two plans: each one gets a per-step check. */
function newlyDone(before: Plan | null, after: Plan): number[] {
  return after.steps
    .filter((s) => s.status === "done" && before?.steps.find((b) => b.index === s.index)?.status !== "done")
    .map((s) => s.index);
}

/**
 * The whole loop for one run: spawn the agent, record every message it sends as a run_events row, collect the
 * files it wrote, evaluate the result and close the run. It is the only writer of a run's rows.
 */
export const runAutomation: RunAutomation = async (runId) => {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) throw new Error(`run ${runId} not found`);
  const workspaceId = run.workspaceId ?? "";

  // Everything before the first message can fail too (a read-only disk, a bad connection row): a run must never
  // stay "queued" with no reason, so these steps close the run as failed like the loop below does.
  const dir = runDir(runId);
  let enabled: Awaited<ReturnType<typeof connectionServers>>["enabled"];
  let servers: Awaited<ReturnType<typeof connectionServers>>["servers"];
  let limits: Awaited<ReturnType<typeof getLimits>>;
  let systemPrompt = SYSTEM_PROMPT;
  let template: AutomationTemplate | null = null;
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
    await db.update(runs).set({ status: "running", connectionIds: enabled.map((c) => c.id) }).where(eq(runs.id, runId));
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db.update(runs).set({ status: "failed", error, finishedAt: new Date() }).where(eq(runs.id, runId));
    await removeRunDir(dir); // this branch returns, so the try/finally below never sees it
    return;
  }

  const map = createMapper();
  let seq = 1;
  const recorded: RunEvent[] = []; // kept so the closing update reads the plan and the result from the same events
  let plan: Plan | null = null;

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
          if (limits.stepChecks) for (const i of newlyDone(before, e.payload)) void stepCheck(e.payload, i);
        }
      }
    });
    return chain;
  };
  const now = () => new Date().toISOString();

  // The per-step check runs beside the agent, never in its way: a slow or failed Jev call records nothing.
  const stepCheck = async (p: Plan, stepIndex: number) => {
    const startedAt = recorded.findLastIndex((e) => e.kind === "plan" && e.payload.steps[stepIndex]?.status === "running");
    const calls = recorded
      .slice(Math.max(0, startedAt))
      .flatMap((e) => (e.kind === "tool_call" ? [{ name: e.payload.name, input: e.payload.input }] : []));
    const check = await checkStep({ prompt: run.prompt, plan: p, stepIndex, calls }).catch(() => null);
    if (check) await write([{ kind: "check", payload: check, at: now() }]);
  };

  const recordGuard = async (r: GuardRecord) => {
    await write([{ kind: "guard", payload: r, at: now() }]);
  };

  // The wall clock the SDK does not keep: turns and budget cannot stop a tool that simply hangs.
  const deadline = startDeadline(AgentLimits.wallClockMs);
  const outputs = createOutputsServer(dir);
  const connectionNames = Object.fromEntries(enabled.map((c) => [connectionKey(c.name), c.name]));

  // Everything from here to the closing update is inside one try: a failure in the file collection, the evaluator
  // or a database write used to leave the run "running" or "evaluating" for ever with nobody to close it.
  try {
    const q = query({
      prompt: run.prompt,
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
      },
    });

    for await (const message of q) await write(map(message, 0, now()));
    deadline.clear(); // the stream is done; nothing left to abort
    await chain; // the step checks still in flight land before the run closes

    const written = await collectFiles(dir);
    if (written.length) {
      await db.insert(filesTable).values(written.map((f) => ({ runId, ...f, ...scanOutput(f) })));
    }

    const end = recorded.find((e) => e.kind === "finished")?.payload;
    // No result message means the child died mid-stream. That is a failure, not a success with no report.
    if (!end) throw new Error("the agent ended without a result");
    const finalPlan = (recorded.filter((e) => e.kind === "plan").at(-1)?.payload ?? null) as Plan | null;
    await db
      .update(runs)
      .set({
        status: "evaluating", // visible while the judge runs: the run is done but the verdict is not
        report: end.result || null,
        error: end.is_error ? end.result || end.subtype : null, // the provider's words when the SDK sent any
        numTurns: end.num_turns,
        durationMs: end.duration_ms,
        costUsd: end.total_cost_usd,
      })
      .where(eq(runs.id, runId));

    // An evaluator failure must not lose the run the agent already did, and must not look like a pass either:
    // the run is stored as "not checked" with the reason, which Re-evaluate can then show (QA Q59).
    const verdict = await evaluateRun({
      prompt: run.prompt,
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

    await db
      .update(runs)
      .set({ status: end.is_error ? "failed" : "succeeded", verdict, finishedAt: new Date() })
      .where(eq(runs.id, runId));
  } catch (err) {
    // An abort reads as a generic "aborted" error, so say which limit ended the run.
    const error = deadline.expired()
      ? `timed out after ${Math.round(AgentLimits.wallClockMs / 1000)} s`
      : err instanceof Error
        ? err.message
        : String(err);
    await chain.catch(() => undefined);
    await db.update(runs).set({ status: "failed", error, finishedAt: new Date() }).where(eq(runs.id, runId));
  } finally {
    deadline.clear();
    // The files that matter are rows in the database by now, so the working directory is rubbish either way;
    // on Vercel /tmp survives between invocations and would fill up (QA Q58).
    await removeRunDir(dir);
  }
};

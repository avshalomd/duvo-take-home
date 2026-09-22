import "server-only";
import { mkdir, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { connections, files as filesTable, runEvents, runs } from "@/db/schema";
import { AgentLimits, type RunAutomation } from "@/contracts/agent";
import type { Plan, RunEvent } from "@/contracts/run";
import { evaluateRun } from "@/lib/eval/evaluate";
import { listEnabledConnectionsWithSecrets } from "@/lib/connections/store";
import { connectionKey } from "@/lib/connections/key";
import { statusUpdates } from "./connection-status";
import { startDeadline } from "./deadline";
import { pathGuard } from "./guard";
import { createMapper } from "./map-message";
import { createPlanServer } from "./plan-tool";
import { SYSTEM_PROMPT } from "./system.prompt";
import { unknownVerdict } from "./unknown-verdict";
import { removeRunDir } from "./workspace";

export const AGENT_MODEL = process.env.AGENT_MODEL ?? "claude-sonnet-5";
const NATIVE_TOOLS = ["WebSearch", "WebFetch", "Read", "Write"]; // everything else is removed below
const MIME: Record<string, string> = { ".csv": "text/csv", ".md": "text/markdown", ".txt": "text/plain" };

/** One working directory per run, gitignored; bypassPermissions lets the agent write anywhere under it.
 *  On Vercel the code directory is read-only, so the run lives under the function's temp dir instead. */
export const runDir = (runId: string) => path.join(process.env.VERCEL ? os.tmpdir() : process.cwd(), "runs", runId);

/** The user's enabled connections as MCP servers, keyed so their tools arrive as mcp__<key>__<tool>. */
async function connectionServers() {
  const enabled = await listEnabledConnectionsWithSecrets();
  const servers: Record<string, { type: "http" | "sse"; url: string; headers?: Record<string, string> }> = {};
  for (const c of enabled) {
    servers[connectionKey(c.name)] = {
      type: c.transport,
      url: c.url,
      headers: c.token ? { Authorization: `Bearer ${c.token}` } : undefined, // the token never leaves the server
    };
  }
  return { enabled, servers };
}

/** Text files the agent left behind, the only outputs we serve (his call, T+10). */
async function collectFiles(dir: string) {
  const out: { name: string; mime: string; bytes: number; content: string }[] = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const ext = path.extname(e.name).toLowerCase();
    if (!e.isFile() || !(AgentLimits.fileExtensions as readonly string[]).includes(ext)) continue;
    const content = await readFile(path.join(dir, e.name), "utf8");
    out.push({ name: e.name, mime: MIME[ext] ?? "text/plain", bytes: Buffer.byteLength(content), content });
  }
  return out;
}

/**
 * The whole loop for one run: spawn the agent, record every message it sends as a run_events row, collect the
 * files it wrote, evaluate the result and close the run. It is the only writer of a run's rows.
 */
export const runAutomation: RunAutomation = async (runId) => {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) throw new Error(`run ${runId} not found`);

  // Everything before the first message can fail too (a read-only disk, a bad connection row): a run must never
  // stay "queued" with no reason, so these steps close the run as failed like the loop below does.
  const dir = runDir(runId);
  let enabled: Awaited<ReturnType<typeof connectionServers>>["enabled"];
  let servers: Awaited<ReturnType<typeof connectionServers>>["servers"];
  try {
    await mkdir(dir, { recursive: true });
    ({ enabled, servers } = await connectionServers());
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

  const record = async (events: RunEvent[]) => {
    for (const e of events) {
      await db.insert(runEvents).values({ runId, seq: e.seq, kind: e.kind, payload: e.payload, at: new Date(e.at) });
      // the init message is where a connection's real status shows up; write it back so the list stops guessing
      if (e.kind === "started") {
        for (const u of statusUpdates(e.payload.mcp_servers, enabled)) {
          await db.update(connections).set({ lastStatus: u.lastStatus }).where(eq(connections.id, u.id));
        }
      }
      recorded.push(e);
      seq = e.seq + 1;
    }
  };

  // The wall clock the SDK does not keep: turns and budget cannot stop a tool that simply hangs.
  const deadline = startDeadline(AgentLimits.wallClockMs);
  const guard = pathGuard(dir);

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
        allowedTools: [...NATIVE_TOOLS, "mcp__plan__*", ...Object.keys(servers).map((k) => `mcp__${k}__*`)],
        disallowedTools: ["Bash", "Edit", "Task", "Glob", "Grep", "NotebookEdit"], // allowedTools approves, only this restricts
        // Permissions are bypassed, so this hook is the only thing stopping a fetched page from talking the agent
        // into reading .env.local or ~/.ssh and writing it into an output we then serve.
        hooks: {
          PreToolUse: [{ matcher: "Read|Write|Edit|Glob|Grep|NotebookEdit", hooks: [async (input) => guard(input as { tool_name: string; tool_input: unknown })] }],
        },
        maxTurns: AgentLimits.maxTurns,
        maxBudgetUsd: AgentLimits.maxBudgetUsd,
        model: AGENT_MODEL,
        systemPrompt: SYSTEM_PROMPT, // a plain string replaces Claude Code's large preset prompt
        mcpServers: { plan: createPlanServer(), ...servers }, // one plan server per run: a shared one connects once
        env: { ...process.env }, // env REPLACES the child's environment: without the spread it has no API key
      },
    });

    for await (const message of q) await record(map(message, seq, new Date().toISOString()));
    deadline.clear(); // the stream is done; nothing left to abort

    const written = await collectFiles(dir);
    if (written.length) await db.insert(filesTable).values(written.map((f) => ({ runId, ...f })));

    const end = recorded.find((e) => e.kind === "finished")?.payload;
    // No result message means the child died mid-stream. That is a failure, not a success with no report.
    if (!end) throw new Error("the agent ended without a result");
    const plan = (recorded.filter((e) => e.kind === "plan").at(-1)?.payload ?? null) as Plan | null;
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
      plan,
      files: written.map((f) => ({ name: f.name, content: f.content })),
      today: new Date().toISOString().slice(0, 10),
      // the tools the run actually called: "claimed a connection but never used it" is a code check, not a judge call
      toolsUsed: [...new Set(recorded.filter((e) => e.kind === "tool_call").map((e) => e.payload.name))],
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
    await db.update(runs).set({ status: "failed", error, finishedAt: new Date() }).where(eq(runs.id, runId));
  } finally {
    deadline.clear();
    // The files that matter are rows in the database by now, so the working directory is rubbish either way;
    // on Vercel /tmp survives between invocations and would fill up (QA Q58).
    await removeRunDir(dir);
  }
};

import { AgentLimits } from "@/contracts/agent";
import type { StepCheck } from "@/contracts/eval";
import type { DeriveState, Plan, PlanStep, RunEvent, RunState } from "@/contracts/run";

// Nothing here is stored: the key state is recomputed from the events at any point of the run.

type ToolCall = { tool_use_id: string; name: string; input: unknown };
type Finished = { subtype: string; is_error: boolean; num_turns: number; duration_ms: number; total_cost_usd: number; result: string };
type Started = { model: string; tools: string[]; mcp_servers: { name: string; status: string }[] };

/** mcp__deepwiki__read_wiki_contents came through the "deepwiki" connection; a native tool came through none. */
function connectionOf(toolName: string): string | null {
  const parts = toolName.split("__");
  return parts.length >= 3 && parts[0] === "mcp" ? parts[1] : null;
}

const basename = (p: string) => p.split("/").pop() ?? p;

/** One readable line for the state card: the field of the input that says what the call was about. */
function summarize(input: unknown): string {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  for (const key of ["query", "file_path", "url", "repoName", "prompt", "path", "question"]) {
    if (typeof i[key] !== "string" || !i[key]) continue;
    const value = String(i[key]);
    // the agent writes with an absolute path; the card shows the file's name, which is what the user recognises
    return (key === "file_path" || key === "path" ? basename(value) : value).slice(0, 140);
  }
  const json = JSON.stringify(input ?? {});
  return json === "{}" ? "" : json.slice(0, 140);
}

// The SDK's own tool lookup, run before the agent does anything: it is the harness searching, not the agent working.
const HOST_TOOLS = ["ToolSearch"];

// Our own MCP servers, given to every run (the keys a connection may not take, RESERVED_KEYS in contracts/connection):
// they are the app's tools, not one of the person's connections. Named here because this file also runs in the browser.
const OUTPUTS_SERVER = "outputs";
const BUILT_IN_SERVERS = ["plan", OUTPUTS_SERVER];

/** The highest turn stamped on any event, or null for a run recorded before the mapper stamped them. */
function maxTurn(events: RunEvent[]): number | null {
  const turns = events.map((e) => (e.payload as { turn?: unknown }).turn).filter((t): t is number => typeof t === "number");
  return turns.length ? Math.max(...turns) : null;
}

export const deriveState: DeriveState = (run, events: RunEvent[]): RunState => {
  const calls: ToolCall[] = events
    .filter((e) => e.kind === "tool_call")
    .map((e) => e.payload as ToolCall)
    .filter((c) => !HOST_TOOLS.includes(c.name));
  const started = events.find((e) => e.kind === "started")?.payload as Started | undefined;
  // Auto-heal gives a run one "finished" per attempt: the last one is the result that stands
  const finished = events.findLast((e) => e.kind === "finished")?.payload as Finished | undefined;
  const plans = events.filter((e) => e.kind === "plan");
  const plan = (plans.length ? plans[plans.length - 1].payload : null) as Plan | null;

  const toolsUsed: string[] = [];
  for (const c of calls) if (!toolsUsed.includes(c.name)) toolsUsed.push(c.name);

  // The agent writes text files with Write (a path) and makes charts and spreadsheets with the outputs tools (a
  // file name): both are files the run made (Q103, Q123).
  const files: string[] = [];
  for (const c of calls) {
    const input = c.input as { file_path?: unknown; file?: unknown } | null;
    const raw = c.name === "Write" ? input?.file_path : c.name.startsWith(`mcp__${OUTPUTS_SERVER}__`) ? input?.file : null;
    const name = typeof raw === "string" ? basename(raw) : null;
    if (name && !files.includes(name)) files.push(name);
  }

  const last = calls[calls.length - 1];
  const stopped = run.status === "cancelled";
  // a stopped run is working on nothing, whatever its last plan said: the stepper shows where it stopped instead
  const currentStep: PlanStep | null = stopped ? null : (plan?.steps.find((s) => s.status === "running") ?? null);

  // The per-step check is asked again if a step is re-done; the latest answer is the one that counts.
  const latestCheck = new Map<number, StepCheck>();
  for (const e of events) if (e.kind === "check") latestCheck.set(e.payload.stepIndex, pickCheck(e.payload));
  const stepChecks = [...latestCheck.values()].sort((a, b) => a.stepIndex - b.stepIndex);

  // "allowed" is the guard doing nothing worth saying; everything else is shown (blocked, flagged, unchecked).
  const guards = events.flatMap((e) =>
    e.kind === "guard" && e.payload.decision !== "allowed"
      ? [{ guard: e.payload.guard, decision: e.payload.decision, reason: e.payload.reason, ...(e.payload.target ? { target: e.payload.target } : {}) }]
      : [],
  );

  return {
    status: run.status,
    // The turn the mapper stamped on the events, which is the SDK's own count; runs recorded before it was
    // stamped have no turn on their payloads, so they fall back to counting tool calls.
    // On a finished run the SDK's own num_turns is the count the cap applied to; while it runs, the mapper's stamp.
    turn: finished?.num_turns ?? maxTurn(events) ?? calls.length,
    maxTurns: AgentLimits.maxTurns,
    plan,
    currentStep,
    lastTool: last ? { name: last.name, summary: summarize(last.input), viaConnection: connectionOf(last.name) } : null,
    toolsUsed,
    connections: (started?.mcp_servers ?? [])
      .filter((s) => !BUILT_IN_SERVERS.includes(s.name)) // the plan and outputs tools are ours, not the person's connections
      .map((s) => ({ name: s.name, status: s.status, used: calls.some((c) => c.name.startsWith(`mcp__${s.name}__`)) })),
    files,
    // Once an attempt has finished, the run row is the one total: the engine counts each attempt once. A finished
    // event carries the SDK's running total of a resumed session, so adding the events up would count the first
    // attempt twice (Q149). Before any attempt has finished there is nothing to show yet.
    costUsd: finished ? (run.costUsd ?? finished.total_cost_usd) : null,
    durationMs: finished ? (run.durationMs ?? finished.duration_ms) : null,
    // The agent's own last words are the most useful error we have; run.error carries a crash before any result.
    // Pressing Stop aborts the agent, which reports an error; it is the person's choice, not a failure to show.
    error: stopped ? null : finished?.is_error ? finished.result || finished.subtype : run.error,
    stepChecks,
    guards,
    // Auto-heal's attempts, in order, with what the check found each time; what the agent was told stays in the
    // events, for Details
    heals: events.flatMap((e) => (e.kind === "heal" ? [{ attempt: e.payload.attempt, max: e.payload.max, reasons: e.payload.reasons }] : [])),
  };
};

// The event payloads are loose objects (the engine may add fields): the state carries only the three it promises.
function pickCheck(p: StepCheck): StepCheck {
  return { stepIndex: p.stepIndex, onTrack: p.onTrack, note: p.note };
}

import { AgentLimits } from "@/contracts/agent";
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

/** One readable line for the state card: the field of the input that says what the call was about. */
function summarize(input: unknown): string {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  for (const key of ["query", "file_path", "url", "repoName", "prompt", "path", "question"]) {
    if (typeof i[key] === "string" && i[key]) return String(i[key]).slice(0, 140);
  }
  const json = JSON.stringify(input ?? {});
  return json === "{}" ? "" : json.slice(0, 140);
}

const basename = (p: string) => p.split("/").pop() ?? p;

export const deriveState: DeriveState = (run, events: RunEvent[]): RunState => {
  const calls: ToolCall[] = events.filter((e) => e.kind === "tool_call").map((e) => e.payload as ToolCall);
  const started = events.find((e) => e.kind === "started")?.payload as Started | undefined;
  const finished = events.find((e) => e.kind === "finished")?.payload as Finished | undefined;
  const plans = events.filter((e) => e.kind === "plan");
  const plan = (plans.length ? plans[plans.length - 1].payload : null) as Plan | null;

  const toolsUsed: string[] = [];
  for (const c of calls) if (!toolsUsed.includes(c.name)) toolsUsed.push(c.name);

  const files: string[] = [];
  for (const c of calls) {
    if (c.name !== "Write") continue;
    const path = (c.input as { file_path?: unknown } | null)?.file_path;
    const name = typeof path === "string" ? basename(path) : null;
    if (name && !files.includes(name)) files.push(name);
  }

  const last = calls[calls.length - 1];
  const currentStep: PlanStep | null = plan?.steps.find((s) => s.status === "running") ?? null;

  return {
    status: run.status,
    turn: calls.length, // one turn per tool call: plan-tool bookkeeping is not counted (see map-message.ts)
    maxTurns: AgentLimits.maxTurns,
    plan,
    currentStep,
    lastTool: last ? { name: last.name, summary: summarize(last.input), viaConnection: connectionOf(last.name) } : null,
    toolsUsed,
    connections: (started?.mcp_servers ?? [])
      .filter((s) => s.name !== "plan") // the plan tool is ours, not one of the user's connections
      .map((s) => ({ name: s.name, status: s.status, used: calls.some((c) => c.name.startsWith(`mcp__${s.name}__`)) })),
    files,
    costUsd: finished ? finished.total_cost_usd : null,
    durationMs: finished ? finished.duration_ms : null,
    // The agent's own last words are the most useful error we have; run.error carries a crash before any result.
    error: finished?.is_error ? finished.result || finished.subtype : run.error,
  };
};

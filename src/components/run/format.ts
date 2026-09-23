// Pure display helpers for the run panel. Kept out of the components so the one-liners can be tested without React.

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ""); // same rule the connection key uses: "DeepWiki" -> "deepwiki"
}

// The state card names connections by the key the SDK used ("deepwiki"); the user named it "DeepWiki".
export function connectionName(key: string, connections: { name: string }[]): string {
  return connections.find((c) => slug(c.name) === slug(key))?.name ?? key;
}

// The evaluator and the state card quote tool ids inside sentences: rewrite them wherever they appear.
export function humanizeTools(text: string, connections: { name: string }[]): string {
  return text.replace(/mcp__[A-Za-z0-9_]+/g, (id) => toolLabel(id, connections));
}

// "mcp__deepwiki__read_wiki_structure" is unreadable in a timeline: show the connection's own name and the tool.
export function toolLabel(name: string, connections: { name: string }[]): string {
  if (!name.startsWith("mcp__")) return name;
  const [, server, ...rest] = name.split("__");
  const tool = rest.join("__");
  // the app's own servers (the plan and the chart/spreadsheet tools) are not a connection the person added (Q103)
  if (BUILT_IN_SERVERS.includes(server)) return `${tool} (built in)`;
  const connection = connections.find((c) => slug(c.name) === server);
  return `${connection?.name ?? server}: ${tool}`;
}

// The keys a connection may not take (RESERVED_KEYS in contracts/connection): they are the app's own tools.
const BUILT_IN_SERVERS = ["plan", "outputs"];

// One argument only: the timeline is scanned, not read. Which argument matters depends on the tool.
function toolArg(input: unknown): string {
  if (typeof input !== "object" || input === null) return "";
  const fields = input as Record<string, unknown>;
  const str = (key: string) => (typeof fields[key] === "string" ? (fields[key] as string) : undefined);

  const url = str("url");
  if (url) return url;
  const path = str("file_path") ?? str("path");
  if (path) return path.split("/").pop() ?? path;
  const query = str("query") ?? str("pattern");
  if (query) return `"${truncate(query)}"`;
  const first = Object.values(fields).find((v) => typeof v === "string") as string | undefined;
  return first ? `"${truncate(first)}"` : "";
}

function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

export function toolLine(name: string, input: unknown, connections: { name: string }[]): string {
  const arg = toolArg(input);
  const label = toolLabel(name, connections);
  return arg ? `${label} ${arg}` : label;
}

export type ToolKind = "search" | "fetch" | "write" | "connection" | "tool";

// Four kinds cover every tool the agent is given; the card shows the kind so a run can be scanned, not read.
export function toolKind(name: string): ToolKind {
  if (name.startsWith("mcp__outputs__")) return "write"; // the chart and spreadsheet tools each make a file
  if (name.startsWith("mcp__plan__")) return "tool";
  if (name.startsWith("mcp__")) return "connection";
  if (name === "WebSearch" || name === "Grep" || name === "Glob") return "search";
  if (name === "WebFetch" || name === "Read") return "fetch";
  if (name === "Write" || name === "Edit") return "write";
  return "tool";
}

/**
 * What one attempt cost (Q149). A heal resumes the same SDK session, whose total_cost_usd keeps running across the
 * attempts, so the engine records the attempt's own cost beside it; a run from before that had only one attempt,
 * for which the total is the attempt. The run's one total is Run.costUsd, never a sum of these lines.
 */
export function attemptCost(payload: { total_cost_usd: number; attempt_cost_usd?: unknown }): number {
  return typeof payload.attempt_cost_usd === "number" ? payload.attempt_cost_usd : payload.total_cost_usd;
}

export function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "-";
  if (ms < 1000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  return `${Math.floor(ms / 60_000)} m ${Math.round((ms % 60_000) / 1000)} s`;
}

export function formatCost(usd: number | null): string {
  if (usd === null || usd === undefined) return "-";
  return `$${usd.toFixed(3)}`; // three decimals: a run costs cents, and two would round most of them to $0.16
}

// UTC clock, not the locale's: the server and the client must render the same string or React reports a mismatch.
export function formatClock(iso: string): string {
  return new Date(iso).toISOString().slice(11, 19);
}

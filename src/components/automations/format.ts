// Pure display helpers for the run panel. Kept out of the components so the one-liners can be tested without React.

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ""); // same rule the connection key uses: "DeepWiki" -> "deepwiki"
}

// "mcp__deepwiki__read_wiki_structure" is unreadable in a timeline: show the connection's own name and the tool.
function toolLabel(name: string, connections: { name: string }[]): string {
  if (!name.startsWith("mcp__")) return name;
  const [, server, ...rest] = name.split("__");
  const tool = rest.join("__");
  const connection = connections.find((c) => slug(c.name) === server);
  return `${connection?.name ?? server}: ${tool}`;
}

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

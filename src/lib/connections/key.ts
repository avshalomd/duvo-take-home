/**
 * The MCP server key a connection name becomes: mcpServers[key], so its tools arrive as mcp__<key>__*.
 * "GitHub (read-only)" -> "github_read_only". The agent package uses this same function, so the name the
 * user typed and the tool prefix shown in the trace can never drift apart.
 */
export function connectionKey(name: string): string {
  const key = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_") // every run of punctuation or space becomes one separator
    .replace(/^_+|_+$/g, "");
  return key || "server"; // a name that is all punctuation would give an empty key, which mcpServers cannot use
}

// The agent child runs with permissions bypassed, so what it can reach is decided here, not by allowedTools. It used
// to get `{ ...process.env }`: from a dev server started inside a Claude Code session that meant the developer's
// session and OAuth variables, and with them the developer's claude.ai connectors - Gmail, Plane, Docs (QA Q134).

/** What the child needs to start, find its temp and home directories (where its session files live), and read text. */
const SYSTEM = ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "TZ", "NODE_EXTRA_CA_CERTS"];
/**
 * The model backend. ANTHROPIC_API_KEY for Anthropic direct; ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN only for the
 * documented OpenRouter backend (.claude/docs/agent-sdk.md, Backends), and only when they are set.
 */
const BACKEND = ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN"];

/** The agent child's environment, built from an allowlist of the parent's: nothing else reaches it. */
export function childEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of [...SYSTEM, ...BACKEND]) {
    const value = env[name];
    if (value) out[name] = value; // unset or empty stays out: an empty ANTHROPIC_API_KEY would shadow the backend's token
  }
  return out;
}

/** The options that keep the child to what we give it: no settings files, only our MCP servers, no claude.ai connectors. */
export const ISOLATION = {
  settingSources: [] as [], // never this repo's or the user's settings: their hooks, CLAUDE.md and MCP servers
  strictMcpConfig: true as const, // only the servers passed in mcpServers, ignoring .mcp.json, user settings and plugins
  settings: { disableClaudeAiConnectors: true as const }, // the account's claude.ai connectors are never fetched
};

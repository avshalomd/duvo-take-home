// A tripwire behind the isolation options (child-env.ts): if the init message still lists an MCP server that is
// neither ours nor one of the workspace's connections, the run stops before the agent can call it (QA Q134).

/** The MCP servers the init message lists that nobody added: not ours (plan, outputs) and not the workspace's. */
export function unexpectedServers(listed: string[], allowed: string[]): string[] {
  const ok = new Set(allowed);
  return listed.filter((name) => !ok.has(name));
}

/** The plain reason a run is stopped with when the tripwire fires. */
export function tripwireReason(names: string[]): string {
  return `The agent was offered a tool source this workspace did not add (${names.join(", ")}), so the run was stopped before it could use it.`;
}

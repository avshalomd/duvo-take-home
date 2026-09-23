/** The MCP servers the init message lists that nobody added: not ours (plan, outputs) and not the workspace's. */
export function unexpectedServers(listed: string[], allowed: string[]): string[] {
  throw new Error(`not implemented: unexpectedServers(${listed.length}, ${allowed.length})`);
}

/** The plain reason a run is stopped with when the tripwire fires. */
export function tripwireReason(names: string[]): string {
  throw new Error(`not implemented: tripwireReason(${names.length})`);
}

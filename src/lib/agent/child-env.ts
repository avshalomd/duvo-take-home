/** The agent child's environment, built from an allowlist of the parent's: nothing else reaches it. */
export function childEnv(env: Record<string, string | undefined>): Record<string, string> {
  throw new Error(`not implemented: childEnv(${Object.keys(env).length})`);
}

/** The options that keep the child to what we give it: no settings files, only our MCP servers, no claude.ai connectors. */
export const ISOLATION = {} as { settingSources: []; strictMcpConfig: true; settings: { disableClaudeAiConnectors: true } };

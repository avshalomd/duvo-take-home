import "server-only";

/**
 * The output tools as an in-process MCP server (make_chart -> .svg, make_spreadsheet -> .xlsx) writing into the
 * run's directory. null until the outputs package builds it: the run then simply has no output tools.
 */
export const createOutputsServer = (_dir: string): ReturnType<typeof import("@anthropic-ai/claude-agent-sdk").createSdkMcpServer> | null => null; // STUB
export const OUTPUTS_SERVER_KEY = "outputs";

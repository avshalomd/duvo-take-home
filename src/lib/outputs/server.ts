import "server-only";
import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { makeChartTool } from "./tools/make-chart";
import { makeSpreadsheetTool } from "./tools/make-spreadsheet";

export const OUTPUTS_SERVER_KEY = "outputs";

/**
 * The output tools as an in-process MCP server (make_chart -> .svg, make_spreadsheet -> .xlsx) writing into the
 * run's directory. The agent has no code execution, so it sends the data and our code renders the file.
 *
 * One server per run, like the plan tool: an instance can only be connected once, and each run writes into its own
 * directory.
 */
export const createOutputsServer = (dir: string): ReturnType<typeof createSdkMcpServer> =>
  createSdkMcpServer({
    name: OUTPUTS_SERVER_KEY,
    version: "1.0.0",
    // Always in the first prompt, never deferred behind tool search: the system prompt does not name these tools,
    // so the agent only knows it can make a chart if it sees the tool.
    alwaysLoad: true,
    tools: [makeChartTool(dir), makeSpreadsheetTool(dir)],
  });

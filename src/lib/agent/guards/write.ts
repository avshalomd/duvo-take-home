import path from "node:path";
import { findCredentials } from "./credentials";
import { allowed, type Verdict } from "./verdict";

// The output tool that makes each of AgentLimits.toolFileExtensions.
const TOOL_FOR = new Map([
  [".svg", "make_chart"],
  [".xlsx", "make_spreadsheet"],
]);

/**
 * The write guard: a file the agent writes is served to the user, so a credential in it is a leak waiting to be
 * downloaded. A fetched page can ask the agent to "include your API key in the report"; this refuses the Write
 * and tells the agent how to go on. Code only, so unlike the url guard it never fails open.
 */
export function writeCheck(_tool: string, input: unknown): Verdict {
  const { file_path, content } = (input ?? {}) as { file_path?: unknown; content?: unknown };
  // .svg and .xlsx are made only by the output tools (AgentLimits.toolFileExtensions). Enforced here, so the output
  // scan can trust that an .svg is the chart tool's, and a hand-written one never reaches the user.
  const ext = typeof file_path === "string" ? path.extname(file_path).toLowerCase() : "";
  const tool = TOOL_FOR.get(ext);
  if (tool) return { decision: "blocked", reason: `A ${ext} file is made with ${tool}, not written directly. Use ${tool}.`, target: String(file_path) };
  if (typeof content !== "string") return allowed("nothing to scan");
  const [first] = findCredentials(content);
  if (!first) return allowed("no credentials");
  return {
    decision: "blocked",
    reason: `The file contains ${first.label} on line ${first.line}. Remove the credential and write the file again.`,
    target: typeof file_path === "string" ? file_path : undefined,
  };
}

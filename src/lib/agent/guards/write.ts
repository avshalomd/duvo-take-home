import { findCredentials } from "./credentials";
import { allowed, type Verdict } from "./verdict";

/**
 * The write guard: a file the agent writes is served to the user, so a credential in it is a leak waiting to be
 * downloaded. A fetched page can ask the agent to "include your API key in the report"; this refuses the Write
 * and tells the agent how to go on. Code only, so unlike the url guard it never fails open.
 */
export function writeCheck(_tool: string, input: unknown): Verdict {
  const { file_path, content } = (input ?? {}) as { file_path?: unknown; content?: unknown };
  if (typeof content !== "string") return allowed("nothing to scan");
  const [first] = findCredentials(content);
  if (!first) return allowed("no credentials");
  return {
    decision: "blocked",
    reason: `The file contains ${first.label} on line ${first.line}. Remove the credential and write the file again.`,
    target: typeof file_path === "string" ? file_path : undefined,
  };
}

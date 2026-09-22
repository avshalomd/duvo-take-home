import path from "node:path";

/**
 * The file-system guard for the agent's PreToolUse hook. The agent runs with permissions bypassed, so anything it
 * reads - a web page, an MCP server's answer - could tell it to read ~/.ssh or .env.local and write the contents
 * into an output file we then serve. Every file tool is checked here: the path must resolve inside the run's own
 * directory, or the tool call is denied and the denial shows up in the timeline.
 */

type Decision = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    permissionDecision: "allow" | "deny";
    permissionDecisionReason: string;
  };
};

const allow = (reason: string): Decision => ({
  hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: reason },
});

/** The path arguments of the tools we let the agent have: Read/Write/Edit use file_path, Glob/Grep use path. */
function pathArg(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const rec = input as Record<string, unknown>;
  for (const key of ["file_path", "path", "notebook_path"]) {
    const value = rec[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

export function pathGuard(dir: string) {
  const root = path.resolve(dir);
  return (input: { tool_name: string; tool_input: unknown }): Decision => {
    const target = pathArg(input.tool_input);
    if (!target) return allow("no path argument"); // a relative-less call can only reach the agent's own cwd

    // Relative paths resolve against the run directory, which is the agent's cwd; `..` is normalised away by resolve.
    const resolved = path.resolve(root, target);
    // The separator matters: /tmp/runs/abc-other must not pass as a child of /tmp/runs/abc.
    const inside = resolved === root || resolved.startsWith(root + path.sep);
    if (inside) return allow(resolved);
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `${input.tool_name} is limited to this run's directory; ${resolved} is outside it.`,
      },
    };
  };
}

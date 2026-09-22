import { realpathSync } from "node:fs";
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

const real = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return p; // a path that does not exist yet (the file the agent is about to write) has no real path
  }
};

export function pathGuard(dir: string) {
  const root = path.resolve(dir);
  // Both spellings of the run directory count as the run directory: on macOS os.tmpdir() is /var/folders/... and
  // the agent reports its cwd as /private/var/folders/..., and a live run showed it denied its own writes.
  const roots = [...new Set([root, real(root)])];
  const under = (p: string) => roots.some((r) => p === r || p.startsWith(r + path.sep)); // the separator matters:
  // /tmp/runs/abc-other must not pass as a child of /tmp/runs/abc.

  return (input: { tool_name: string; tool_input: unknown }): Decision => {
    const target = pathArg(input.tool_input);
    if (!target) return allow("no path argument"); // a relative-less call can only reach the agent's own cwd

    // Relative paths resolve against the run directory, which is the agent's cwd; `..` is normalised away by resolve.
    const resolved = path.resolve(root, target);
    // An existing file is judged on what it really is, so a symlink laid inside the directory cannot point out of it.
    if (under(resolved) && under(real(resolved))) return allow(resolved);
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `${input.tool_name} is limited to this run's directory; ${resolved} is outside it.`,
      },
    };
  };
}

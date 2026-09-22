import path from "node:path";
import { describe, expect, it } from "vitest";
import { pathGuard } from "./guard";

// Q5: the agent runs with permissions bypassed, so a fetched page could tell it to read ~/.ssh or .env.local and
// write the contents into an output file. This hook is the only thing between that prompt and the file system.
const dir = path.join(path.sep, "tmp", "runs", "abc");
const guard = pathGuard(dir);
const decide = (tool_name: string, tool_input: unknown) => guard({ tool_name, tool_input });
const denied = (out: ReturnType<typeof decide>) => out.hookSpecificOutput?.permissionDecision === "deny";

describe("pathGuard", () => {
  it("allows a write to a file in the run directory", () => {
    expect(denied(decide("Write", { file_path: path.join(dir, "poem.txt"), content: "hi" }))).toBe(false);
  });

  it("allows a relative path, which the agent resolves against its own working directory", () => {
    expect(denied(decide("Write", { file_path: "output.csv" }))).toBe(false);
  });

  it("denies reading a file outside the run directory, such as /etc/hosts", () => {
    const out = decide("Read", { file_path: path.join(path.sep, "etc", "hosts") });
    expect(denied(out)).toBe(true);
    expect(out.hookSpecificOutput?.permissionDecisionReason).toMatch(/etc/);
  });

  it("denies a path that climbs out of the run directory with ..", () => {
    expect(denied(decide("Read", { file_path: "../../.env.local" }))).toBe(true);
  });

  it("denies a sibling directory whose name starts with the run directory's name", () => {
    expect(denied(decide("Write", { file_path: `${dir}-other/secrets.txt` }))).toBe(true);
  });

  it("guards Glob and Grep too, which take `path` rather than `file_path`", () => {
    expect(denied(decide("Grep", { pattern: "KEY", path: path.join(path.sep, "Users") }))).toBe(true);
    expect(denied(decide("Glob", { pattern: "*.txt", path: dir }))).toBe(false);
  });

  it("allows a tool call that names no path at all: it cannot reach outside the directory", () => {
    expect(denied(decide("Glob", { pattern: "*.csv" }))).toBe(false);
    expect(denied(decide("WebSearch", { query: "ai news" }))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { tripwireReason, unexpectedServers } from "./mcp-tripwire";

describe("unexpectedServers (Q134 tripwire)", () => {
  const allowed = ["plan", "outputs", "deepwiki"];

  it("accepts our own servers and the workspace's connections", () => {
    expect(unexpectedServers(["plan", "outputs", "deepwiki"], allowed)).toEqual([]);
  });

  it("accepts a run with fewer servers than it was given (a connection that failed to start is still ours)", () => {
    expect(unexpectedServers(["plan"], allowed)).toEqual([]);
  });

  it("names every server nobody added, such as the developer's claude.ai connectors", () => {
    expect(unexpectedServers(["plan", "claude.ai Gmail", "outputs", "claude.ai Plane"], allowed)).toEqual(["claude.ai Gmail", "claude.ai Plane"]);
  });
});

describe("tripwireReason", () => {
  it("says in plain words why the run stopped, naming the source", () => {
    expect(tripwireReason(["claude.ai Gmail"])).toBe(
      "The agent was offered a tool source this workspace did not add (claude.ai Gmail), so the run was stopped before it could use it.",
    );
  });

  it("names several sources in one sentence", () => {
    expect(tripwireReason(["claude.ai Gmail", "claude.ai Plane"])).toContain("(claude.ai Gmail, claude.ai Plane)");
  });
});

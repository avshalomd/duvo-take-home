import { describe, expect, it } from "vitest";
import type { RunEvent } from "@/contracts/run";
import { missingConnections, usedConnections } from "./connections";

const call = (seq: number, name: string): RunEvent => ({
  seq,
  at: "2026-09-23T10:00:00.000Z",
  kind: "tool_call",
  payload: { tool_use_id: `t${seq}`, name, input: {} },
});

const workspace = [
  { name: "DeepWiki", enabled: true },
  { name: "GitHub (read-only)", enabled: false },
];

describe("usedConnections", () => {
  it("names the connections the run actually called, by their name in Settings", () => {
    const events = [call(1, "WebSearch"), call(2, "mcp__deepwiki__read_wiki_structure"), call(3, "mcp__deepwiki__ask_question")];
    expect(usedConnections(events, workspace)).toEqual(["DeepWiki"]);
  });

  it("maps a name with punctuation through its key", () => {
    expect(usedConnections([call(1, "mcp__github_read_only__search")], workspace)).toEqual(["GitHub (read-only)"]);
  });

  it("ignores the app's own tool servers, which are not connections", () => {
    expect(usedConnections([call(1, "mcp__plan__set_plan"), call(2, "Write")], workspace)).toEqual([]);
  });
});

describe("missingConnections", () => {
  it("is empty when every required connection is on", () => {
    expect(missingConnections(["DeepWiki"], workspace)).toEqual([]);
  });

  it("names a required connection that is off", () => {
    expect(missingConnections(["GitHub (read-only)"], workspace)).toEqual(["GitHub (read-only)"]);
  });

  it("names a required connection the workspace does not have", () => {
    expect(missingConnections(["Notion"], workspace)).toEqual(["Notion"]);
  });

  it("matches names by their key, so a change of case is not a missing connection", () => {
    expect(missingConnections(["deepwiki"], workspace)).toEqual([]);
  });
});

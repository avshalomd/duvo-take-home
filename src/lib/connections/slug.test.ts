// The key a connection's name becomes: the agent registers it as mcpServers[key], so its tools arrive as mcp__<key>__*.
import { describe, expect, it } from "vitest";
import { connectionKey } from "./key";

describe("connectionKey", () => {
  it("lowercases a one-word name: DeepWiki -> deepwiki", () => {
    expect(connectionKey("DeepWiki")).toBe("deepwiki");
  });

  it("turns the punctuation in GitHub (read-only) into single underscores: github_read_only", () => {
    expect(connectionKey("GitHub (read-only)")).toBe("github_read_only");
  });

  it("collapses a run of non-alphanumerics into one underscore", () => {
    expect(connectionKey("My  MCP --- server")).toBe("my_mcp_server");
  });

  it("trims the separators at both ends so the key never starts or ends with _", () => {
    expect(connectionKey("  _Notion_  ")).toBe("notion");
  });

  it("keeps digits, so Jira 2.0 stays distinguishable as jira_2_0", () => {
    expect(connectionKey("Jira 2.0")).toBe("jira_2_0");
  });

  it("is stable when applied to a key it already produced", () => {
    const once = connectionKey("GitHub (read-only)");
    expect(connectionKey(once)).toBe(once);
  });

  it("answers a non-empty key for a name that is all punctuation, so mcpServers never gets an empty key", () => {
    expect(connectionKey("***")).toBe("server");
  });
});

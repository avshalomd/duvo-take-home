import { describe, expect, it } from "vitest";
import { formatCost, formatDuration, toolLine } from "./format";

const connections = [{ name: "DeepWiki" }, { name: "GitHub (read-only)" }];

describe("toolLine - one line per tool call, readable without opening the payload", () => {
  it("shows a web search as the tool and its quoted query", () => {
    expect(toolLine("WebSearch", { query: "AI news September 2026" }, connections)).toBe(
      'WebSearch "AI news September 2026"',
    );
  });

  it("shows a file write as the tool and the file it wrote", () => {
    expect(toolLine("Write", { file_path: "runs/run_1/output.csv", content: "a,b\n" }, connections)).toBe(
      "Write output.csv",
    );
  });

  it("names the connection behind an mcp__ tool instead of the raw prefix", () => {
    expect(toolLine("mcp__deepwiki__read_wiki_structure", { repoName: "modelcontextprotocol/servers" }, connections))
      .toBe('DeepWiki: read_wiki_structure "modelcontextprotocol/servers"');
  });

  it("falls back to the server key when no connection matches it", () => {
    expect(toolLine("mcp__linear__list_issues", {}, connections)).toBe("linear: list_issues");
  });

  it("shows a fetch by its url", () => {
    expect(toolLine("WebFetch", { url: "https://example.com/a", prompt: "dates" }, connections)).toBe(
      "WebFetch https://example.com/a",
    );
  });
});

describe("formatDuration - seconds for short runs, minutes for long ones", () => {
  it("renders under a minute as whole seconds", () => {
    expect(formatDuration(41782)).toBe("42 s");
  });

  it("renders over a minute as minutes and seconds", () => {
    expect(formatDuration(151554)).toBe("2 m 32 s");
  });

  it("renders a missing duration as a dash", () => {
    expect(formatDuration(null)).toBe("-");
  });
});

describe("formatCost - three decimals, because runs cost cents", () => {
  it("renders a cost in dollars", () => {
    expect(formatCost(0.1642)).toBe("$0.164");
  });

  it("renders a missing cost as a dash", () => {
    expect(formatCost(null)).toBe("-");
  });
});

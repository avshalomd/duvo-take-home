import { describe, expect, it } from "vitest";
import { attemptCost, connectionName, formatCost, formatDuration, humanizeTools, relativeToRun, runFolders, toolKind, toolLabel, toolLine } from "./format";

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

  // Q103: "outputs: make_chart" read as a connection called outputs
  it("names the app's own tools as built in, never behind a server prefix", () => {
    expect(toolLabel("mcp__outputs__make_chart", connections)).toBe("make_chart (built in)");
    expect(toolLabel("mcp__plan__update_step", connections)).toBe("update_step (built in)");
    expect(humanizeTools("used mcp__outputs__make_spreadsheet", connections)).toBe("used make_spreadsheet (built in)");
  });

  it("shows a fetch by its url", () => {
    expect(toolLine("WebFetch", { url: "https://example.com/a", prompt: "dates" }, connections)).toBe(
      "WebFetch https://example.com/a",
    );
  });
});

describe("toolKind - the timeline is scanned by what the agent was doing", () => {
  it("sorts the native tools into search, fetch, read and write", () => {
    expect(toolKind("WebSearch")).toBe("search");
    expect(toolKind("WebFetch")).toBe("fetch");
    expect(toolKind("Write")).toBe("write");
  });

  // reading a file in the run's own folder was badged "fetch", as if it had gone to the web
  it("calls reading a local file read, not fetch", () => {
    expect(toolKind("Read")).toBe("read");
  });

  it("marks anything that went through a connection as a connection call", () => {
    expect(toolKind("mcp__deepwiki__read_wiki_structure")).toBe("connection");
  });

  it("marks the built-in chart and spreadsheet tools as writing a file, and the plan tool as a tool, never a connection", () => {
    expect(toolKind("mcp__outputs__make_chart")).toBe("write");
    expect(toolKind("mcp__plan__update_step")).toBe("tool");
  });

  it("falls back to tool for anything else", () => {
    expect(toolKind("Bash")).toBe("tool");
  });
});

// Q149: a resumed session's finished event carries the SDK's running total; the engine adds the attempt's own cost
describe("attemptCost - what one attempt cost, for its line in Details", () => {
  it("is the attempt's own cost when the engine recorded it", () => {
    expect(attemptCost({ total_cost_usd: 0.16, attempt_cost_usd: 0.06 })).toBe(0.06);
  });

  it("is the SDK's total for a run recorded before attempts were costed: it had only one", () => {
    expect(attemptCost({ total_cost_usd: 0.12 })).toBe(0.12);
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

describe("connectionName - the server's key becomes the name the user gave it", () => {
  const connections = [{ name: "DeepWiki" }, { name: "GitHub (read-only)" }];

  it("turns the mcp key back into the display name", () => {
    expect(connectionName("deepwiki", connections)).toBe("DeepWiki");
  });

  it("keeps an unknown key rather than inventing a name", () => {
    expect(connectionName("linear", connections)).toBe("linear");
  });
});

describe("humanizeTools - no mcp__x__y ever reaches the screen", () => {
  const connections = [{ name: "DeepWiki" }];

  it("rewrites tool ids inside a sentence the evaluator wrote", () => {
    expect(humanizeTools("used mcp__deepwiki__ask_wiki_question twice", connections)).toBe(
      "used DeepWiki: ask_wiki_question twice",
    );
  });

  it("leaves a sentence with no tool ids untouched", () => {
    expect(humanizeTools("the CSV has 10 rows", connections)).toBe("the CSV has 10 rows");
  });
});

// Q187: a Write result said "The file /Users/.../runs/<id>/countries.csv has been updated": the machine's path
describe("relativeToRun - paths in the run's own folder, as the run sees them", () => {
  const folder = "/Users/someone/projects/app/runs/15f8b99d";
  const started = (cwd?: unknown) => ({ kind: "started", payload: { cwd } });

  it("finds the run's folder in its started events, once each", () => {
    expect(runFolders([started(folder), { kind: "text", payload: {} }, started(folder), started(undefined)])).toEqual([folder]);
  });

  it("writes a path inside the run's folder relative to it", () => {
    expect(relativeToRun(`The file ${folder}/countries.csv has been updated successfully.`, [folder])).toBe(
      "The file countries.csv has been updated successfully.",
    );
    expect(relativeToRun(`${folder}/out/a.csv and ${folder}/b.csv`, [folder])).toBe("out/a.csv and b.csv");
  });

  it("leaves other text alone, and the folder itself reads as this folder", () => {
    expect(relativeToRun("Wrote chart.svg (bar chart, 5 points)", [folder])).toBe("Wrote chart.svg (bar chart, 5 points)");
    expect(relativeToRun(`ls ${folder}`, [folder])).toBe("ls .");
    expect(relativeToRun(`${folder}-other/x.csv`, [folder])).toBe(`${folder}-other/x.csv`);
  });
});

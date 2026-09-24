import { describe, expect, it } from "vitest";
import { attemptCost, connectionName, elapsedLine, formatCost, formatDuration, humanizeTools, relativeToRun, runFolders, toolKind, toolLabel, toolLine, turnsLine } from "./format";

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

// Q198: the state's turn is the live turn while the run works and the run's total once it ended; a finished run said
// "turn 17 of 25", as if it were still counting
describe("turnsLine - how far the agent went, in turns", () => {
  it("counts up against the cap while the run works", () => {
    expect(turnsLine("running", 3, 25)).toBe("turn 3 of 25");
    expect(turnsLine("evaluating", 9, 25)).toBe("turn 9 of 25");
  });

  it("says the total once the run has ended, with no cap", () => {
    expect(turnsLine("succeeded", 17, 25)).toBe("17 turns");
    expect(turnsLine("failed", 1, 25)).toBe("1 turn");
    expect(turnsLine("cancelled", 4, 25)).toBe("4 turns");
  });

  it("says nothing for a run that has not taken a turn", () => {
    expect(turnsLine("failed", 0, 25)).toBeNull();
    expect(turnsLine("queued", 0, 25)).toBeNull();
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

// UX QA U9: a live run's header read "0.0 s so far", then "0.5 s so far", like a stopwatch
describe("elapsedLine - a live run's clock, in words a person reads", () => {
  it("says Just started for the first second, never tenths", () => {
    expect(elapsedLine(0)).toBe("Just started");
    expect(elapsedLine(500)).toBe("Just started");
    expect(elapsedLine(999)).toBe("Just started");
  });

  it("then counts whole seconds, then minutes and seconds", () => {
    expect(elapsedLine(1000)).toBe("1 s so far");
    expect(elapsedLine(41_782)).toBe("41 s so far");
    expect(elapsedLine(151_554)).toBe("2 m 31 s so far");
  });

  it("never goes below zero when the browser's clock is behind the server's", () => {
    expect(elapsedLine(-3000)).toBe("Just started");
  });
});

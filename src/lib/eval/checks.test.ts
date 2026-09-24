import { describe, expect, it } from "vitest";
import { AgentLimits } from "@/contracts/agent";
import type { EvaluateInput } from "@/contracts/eval";
import { asksForFile, runChecks } from "./checks";

// The code checks are the half of the evaluator that costs nothing and can never be talked round. Each test names
// the failure a user would report ("it saved an empty file") rather than the function it happens to call.
function input(over: Partial<EvaluateInput> = {}): EvaluateInput {
  return {
    prompt: "Fetch the latest AI news and save them into a CSV with title, source, url, published_at, summary.",
    runStatus: "succeeded",
    report: "Wrote output.csv.",
    plan: null,
    files: [],
    today: "2026-09-22",
    ...over,
  };
}

const csv = (content: string) => [{ name: "output.csv", content }];
const goodCsv =
  "title,source,url,published_at,summary\n" +
  '"A ships X",Anthropic,https://a.example/1,2026-09-21,"Structured output"\n' +
  '"B raises money",Bloomberg,https://b.example/2,2026-09-18,"Series D"\n';

function check(checks: ReturnType<typeof runChecks>, id: string) {
  return checks.find((c) => c.id === id);
}
const failedIds = (checks: ReturnType<typeof runChecks>) => checks.filter((c) => !c.ok).map((c) => c.id);

describe("runChecks", () => {
  it("passes a CSV that has a header and rows", () => {
    const checks = runChecks(input({ files: csv(goodCsv) }));
    expect(failedIds(checks)).toEqual([]);
    expect(check(checks, "parses")?.ok).toBe(true);
    expect(check(checks, "rows")?.detail).toMatch(/2 row/);
  });

  it("fails 'rows' on a header-only CSV and says there are no rows", () => {
    const checks = runChecks(input({ files: csv("title,source,url,published_at,summary\n") }));
    expect(failedIds(checks)).toContain("rows");
    expect(check(checks, "rows")?.detail).toMatch(/no rows/i);
  });

  it("fails 'rows' when the instructions ask for a row floor the file does not reach", () => {
    const checks = runChecks(input({ prompt: "Save the news to a CSV. At least 8 rows.", files: csv(goodCsv) }));
    expect(failedIds(checks)).toContain("rows");
    expect(check(checks, "rows")?.detail).toMatch(/8/);
  });

  it("fails 'parses' on an unterminated quote, with the parser's own words", () => {
    const broken = 'title,source\n"A ships X, with structured output,Anthropic\nB raises money,Bloomberg\n';
    const checks = runChecks(input({ files: csv(broken) }));
    expect(failedIds(checks)).toContain("parses");
    expect(check(checks, "parses")?.detail).toMatch(/quote/i);
  });

  it("fails 'duplicates' when the same URL is padded out over several rows", () => {
    const padded =
      "title,source,url,published_at,summary\n" +
      '"MCP joins the LF",InfoWorld,https://iw.example/mcp,2026-09-17,"One"\n' +
      '"MCP goes to the LF",InfoWorld,https://iw.example/mcp,2026-09-17,"Two"\n' +
      '"Mistral raises",Bloomberg,https://bb.example/m,2026-09-18,"Three"\n';
    const checks = runChecks(input({ files: csv(padded) }));
    expect(failedIds(checks)).toContain("duplicates");
    expect(check(checks, "duplicates")?.detail).toMatch(/2 distinct/);
  });

  // Q9: a row with no URL has no identity to duplicate. It used to be dropped from the distinct set but still
  // counted in the total, so a single URL-less row failed a file in which nothing was repeated.
  it("passes 'duplicates' when one row has no URL and no row is actually repeated", () => {
    const oneBlank =
      "title,source,url,published_at,summary\n" +
      '"A ships X",Anthropic,https://a.example/1,2026-09-21,"One"\n' +
      '"B raises money",Bloomberg,,2026-09-18,"Two"\n' +
      '"C opens up",Reuters,https://c.example/3,2026-09-19,"Three"\n';
    const checks = runChecks(input({ files: csv(oneBlank) }));
    expect(failedIds(checks)).not.toContain("duplicates");
  });

  it("still fails 'duplicates' when two rows share a URL and a third has none", () => {
    const blankAndPadded =
      "title,source,url,published_at,summary\n" +
      '"MCP joins the LF",InfoWorld,https://iw.example/mcp,2026-09-17,"One"\n' +
      '"MCP goes to the LF",InfoWorld,https://iw.example/mcp,2026-09-17,"Two"\n' +
      '"Mistral raises",Bloomberg,,2026-09-18,"Three"\n';
    const checks = runChecks(input({ files: csv(blankAndPadded) }));
    expect(failedIds(checks)).toContain("duplicates");
  });

  it("fails 'columns' when the header misses the columns the instructions named", () => {
    const wrong = "headline,link,blurb\n" + '"A ships X",https://a.example/1,"Structured output"\n';
    const checks = runChecks(input({ files: csv(wrong) }));
    expect(failedIds(checks)).toContain("columns");
    expect(check(checks, "columns")?.detail).toMatch(/published_at/);
  });

  it("fails 'freshness' when 'the last 7 days' was asked for and the rows are years old", () => {
    const stale =
      "title,source,url,published_at,summary\n" +
      '"GPT-4o",OpenAI,https://o.example/1,2024-05-13,"Multimodal"\n' +
      '"Llama 3",Meta,https://m.example/2,2024-04-18,"Open weights"\n';
    const checks = runChecks(input({ prompt: "Latest AI news to a CSV. Last 7 days only.", files: csv(stale) }));
    expect(failedIds(checks)).toContain("freshness");
    expect(check(checks, "freshness")?.detail).toMatch(/2024/);
  });

  it("passes a non-empty .md and fails an empty one", () => {
    const ok = runChecks(input({ prompt: "Write a short report to notes.md", files: [{ name: "notes.md", content: "# Notes\nOne." }] }));
    expect(failedIds(ok)).toEqual([]);
    const empty = runChecks(input({ prompt: "Write a short report to notes.md", files: [{ name: "notes.md", content: "   \n" }] }));
    expect(failedIds(empty)).toContain("content");
  });

  it("fails 'file_expected' when the instructions ask for a file and none was written", () => {
    const checks = runChecks(input({ files: [] }));
    expect(failedIds(checks)).toContain("file_expected");
  });

  it("asks for no file when the instructions only ask a question", () => {
    const checks = runChecks(input({ prompt: "What did Anthropic announce this week?", files: [], report: "They shipped X." }));
    expect(check(checks, "file_expected")).toBeUndefined();
    expect(failedIds(checks)).toEqual([]);
  });

  it("accepts the chart (.svg) and spreadsheet (.xlsx) files the v2 output tools make", () => {
    const files = [
      { name: "prices.svg", content: "<svg xmlns='http://www.w3.org/2000/svg'></svg>" },
      { name: "prices.xlsx", content: "(application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, 6120 bytes)" },
    ];
    const checks = runChecks(input({ prompt: "Chart the prices and export a spreadsheet.", files }));
    expect(check(checks, "extension")?.ok).toBe(true);
  });

  it("accepts every file type the run loop collects, so the evaluator and the collector cannot drift apart", () => {
    const types = [...AgentLimits.fileExtensions, ...AgentLimits.toolFileExtensions];
    const files = types.map((ext) => ({ name: `out${ext}`, content: ext === ".csv" ? "a,b\n1,2\n" : "x" }));
    expect(check(runChecks(input({ prompt: "Do it.", files })), "extension")?.ok).toBe(true);
  });

  it("does not read a chart or a spreadsheet as text: no content, parse or row check on them", () => {
    const files = [
      { name: "chart.svg", content: "<svg xmlns='http://www.w3.org/2000/svg'><title>Prices</title><text>apples 3</text></svg>" },
      { name: "data.xlsx", content: "(application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, 6120 bytes)" },
    ];
    const checks = runChecks(input({ prompt: "Chart the prices.", files }));
    expect(checks.map((c) => c.id).filter((id) => ["content", "parses", "rows"].includes(id))).toEqual([]);
    expect(failedIds(checks)).toEqual([]);
  });

  // Q124: with two files, "3 rows" or "29 characters" does not say which file it is about.
  it("names the file in every check that reads one, so two files are never confused", () => {
    const files = [
      { name: "news.csv", content: goodCsv },
      { name: "notes.md", content: "# Notes\nOne." },
    ];
    const prompt = "Save the news of the last 7 days into a CSV with title, source, url, published_at, summary. Add notes too.";
    const perFile = runChecks(input({ prompt, files })).filter((c) => ["content", "parses", "rows", "columns", "urls", "duplicates", "freshness"].includes(c.id));
    expect(perFile.map((c) => c.id).sort()).toEqual(["columns", "content", "duplicates", "freshness", "parses", "rows", "urls"]);
    for (const c of perFile) expect(c.detail, c.id).toMatch(/^(news\.csv|notes\.md)[: ]/);
    expect(perFile.find((c) => c.id === "content")?.label).toBe("notes.md has content");
  });

  it("rejects a file type the agent was not allowed to write", () => {
    const checks = runChecks(input({ files: [{ name: "chart.png", content: "\x89PNG" }] }));
    expect(failedIds(checks)).toContain("extension");
    expect(check(checks, "extension")?.detail).toMatch(/\.png/);
  });

  it("fails 'connection_used' when the instructions name a connected server the run never called", () => {
    const checks = runChecks(
      input({
        prompt: "Using the connected DeepWiki server, read the repo and write output.csv with area, what_it_does, why_it_matters.",
        files: csv("area,what_it_does,why_it_matters\nOverview,\"Servers\",\"Entry point\"\n"),
        toolsUsed: ["WebFetch", "Write"],
      }),
    );
    expect(failedIds(checks)).toContain("connection_used");
    expect(check(checks, "connection_used")?.detail).toMatch(/mcp__deepwiki__/);
  });

  it("passes 'connection_used' when the connection's own tools were called", () => {
    const checks = runChecks(
      input({
        prompt: "Using the connected DeepWiki server, read the repo and write output.csv with area, what_it_does, why_it_matters.",
        files: csv("area,what_it_does,why_it_matters\nOverview,\"Servers\",\"Entry point\"\n"),
        toolsUsed: ["mcp__deepwiki__read_wiki_structure", "Write"],
      }),
    );
    expect(failedIds(checks)).toEqual([]);
  });

  // Engine review #3: the prefix was the name as typed, so "Deep-Wiki" looked for mcp__deep-wiki while its tools are
  // mcp__deep_wiki__*, and "Git" matched the mcp__github__ tools of another connection.
  const connectionFile = csv("area,what_it_does\nOverview,\"Servers\"\n");
  it("passes 'connection_used' for a connection whose name has punctuation, read through its tool key", () => {
    const prompt = "Using the connected Deep-Wiki server, write output.csv with area, what_it_does.";
    const checks = runChecks(input({ prompt, files: connectionFile, toolsUsed: ["mcp__deep_wiki__ask_question", "Write"] }));
    expect(failedIds(checks)).toEqual([]);
  });

  it("passes 'connection_used' when the named connection's key has more words after the name", () => {
    const prompt = "Using the connected GitHub server, write output.csv with area, what_it_does.";
    const checks = runChecks(input({ prompt, files: connectionFile, toolsUsed: ["mcp__github_read_only__list_issues", "Write"] }));
    expect(failedIds(checks)).toEqual([]);
  });

  it("fails 'connection_used' when only another connection whose key starts with the same letters was used", () => {
    const prompt = "Using the connected Git server, write output.csv with area, what_it_does.";
    const checks = runChecks(input({ prompt, files: connectionFile, toolsUsed: ["mcp__github__list_issues", "Write"] }));
    expect(failedIds(checks)).toContain("connection_used");
  });

  it("says nothing about connections when no tool names were recorded", () => {
    const checks = runChecks(input({ prompt: "Using the connected DeepWiki server, write output.csv with area, what_it_does.", files: csv("area,what_it_does\nOverview,\"Servers\"\n") }));
    expect(check(checks, "connection_used")).toBeUndefined(); // no evidence either way is not a failure
  });

  it("fails 'completed' when the run itself did not finish, quoting the error", () => {
    const checks = runChecks(
      input({ runStatus: "failed", files: [], report: "error_max_turns\nAPI Error 400: web_search is not enabled for this organization" }),
    );
    expect(failedIds(checks)).toContain("completed");
    expect(check(checks, "completed")?.detail).toMatch(/web_search is not enabled/);
  });
});

// Q77: the evaluator passed a CSV whose last row had an unquoted comma in the title. The row had 6 fields against a
// 5-column header, so every cell after the comma was shifted: "WION" (the source) sat in the url column and was
// counted as a distinct URL, and the shifted date was silently dropped from the freshness check.
describe("runChecks on a CSV with a ragged row", () => {
  const raggedCsv =
    "title,source,url,published_at,summary\n" +
    '"A ships X",Anthropic,https://a.example/1,2026-09-21,"One"\n' +
    '"B raises money",Bloomberg,https://b.example/2,2026-09-18,"Two"\n' +
    '"C opens up",Reuters,https://c.example/3,2026-09-19,"Three"\n' +
    '"D ships Y",TechCrunch,https://d.example/4,2026-09-20,"Four"\n' +
    "Trump says India, US close to trade deal,WION,https://w.example/5,2026-09-20,Five\n";

  it("fails 'parses' and names the row and both field counts", () => {
    const checks = runChecks(input({ files: csv(raggedCsv) }));
    expect(failedIds(checks)).toContain("parses");
    expect(check(checks, "parses")?.detail).toMatch(/row 6 has 6 fields, the header has 5/);
  });

  it("keeps the shifted cells of a ragged row out of the URL set and says it skipped the row", () => {
    const checks = runChecks(input({ files: csv(raggedCsv) }));
    const detail = check(checks, "duplicates")?.detail ?? "";
    expect(detail).toMatch(/4 rows, 4 distinct urls/); // the ragged row is not a fifth URL
    expect(detail.toLowerCase()).not.toContain("wion");
    expect(detail).toMatch(/1 skipped/);
  });

  it("says in 'freshness' how many rows it could not read", () => {
    const checks = runChecks(input({ files: csv(raggedCsv) }));
    expect(check(checks, "freshness")?.detail).toMatch(/1 skipped/);
  });

  it("names every ragged row when there is more than one", () => {
    const two = raggedCsv + "Meta, Google and the rest,Reuters,https://r.example/6,2026-09-21,Six\n";
    const checks = runChecks(input({ files: csv(two) }));
    expect(check(checks, "parses")?.detail).toMatch(/row 6 has 6 fields, the header has 5.*1 more row/);
  });
});

// Q77, second half: the url column is the identity the duplicate check keys on, so a cell that is not a URL is
// named rather than compared. Fixture-shaped cases: the ragged CSV must fail, the non-URL one must be named.
describe("runChecks on a url column that does not hold URLs", () => {
  it("fails 'urls' and names the cells that are not links", () => {
    const notUrls =
      "title,source,url,published_at,summary\n" +
      '"A ships X",Anthropic,WION,2026-09-21,"One"\n' +
      '"B raises money",Bloomberg,Reuters,2026-09-18,"Two"\n';
    const checks = runChecks(input({ files: csv(notUrls) }));
    expect(failedIds(checks)).toContain("urls");
    expect(check(checks, "urls")?.detail).toMatch(/WION/);
  });

  it("leaves a blank url cell alone: a row with no link is not a broken link", () => {
    const oneBlank =
      "title,source,url,published_at,summary\n" +
      '"A ships X",Anthropic,https://a.example/1,2026-09-21,"One"\n' +
      '"B raises money",Bloomberg,,2026-09-18,"Two"\n';
    const checks = runChecks(input({ files: csv(oneBlank) }));
    expect(failedIds(checks)).not.toContain("urls");
  });
});

// Q77, third half: "the rows are from the last 7 days" is a promise about every row. A row whose date cannot be
// read is not evidence of freshness, so it counts against the check instead of disappearing from the denominator.
describe("runChecks freshness with dates it cannot read", () => {
  const recent = "Latest AI news to a CSV. Last 7 days only.";

  it("fails when most rows carry no readable date", () => {
    const undated =
      "title,source,url,published_at,summary\n" +
      '"A ships X",Anthropic,https://a.example/1,2026-09-21,"One"\n' +
      '"B raises money",Bloomberg,https://b.example/2,,"Two"\n' +
      '"C opens up",Reuters,https://c.example/3,recently,"Three"\n';
    const checks = runChecks(input({ prompt: recent, files: csv(undated) }));
    expect(failedIds(checks)).toContain("freshness");
    expect(check(checks, "freshness")?.detail).toMatch(/2 of 3 rows/);
    expect(check(checks, "freshness")?.detail).toMatch(/no readable date/);
  });

  it("passes but still names the undated row when the rest are fresh", () => {
    const mostlyDated =
      "title,source,url,published_at,summary\n" +
      '"A ships X",Anthropic,https://a.example/1,2026-09-21,"One"\n' +
      '"B raises money",Bloomberg,https://b.example/2,2026-09-20,"Two"\n' +
      '"C opens up",Reuters,https://c.example/3,2026-09-19,"Three"\n' +
      '"D ships Y",TechCrunch,https://d.example/4,soon,"Four"\n';
    const checks = runChecks(input({ prompt: recent, files: csv(mostlyDated) }));
    expect(failedIds(checks)).not.toContain("freshness");
    expect(check(checks, "freshness")?.detail).toMatch(/no readable date/);
  });
});

// Q61: "use the connected DeepWiki server if it helps, otherwise search the web" is an offer, not a requirement.
// The hard check belongs to the wording that makes the connection the only allowed route.
describe("runChecks on a connection the instructions only offer", () => {
  const offered =
    "Use the connected DeepWiki server if it helps, otherwise search the web, and write output.csv with area, what_it_does.";
  const file = csv('area,what_it_does\nOverview,"Servers"\n');

  it("passes a web-only run and records that the connection was mentioned, not required", () => {
    const checks = runChecks(input({ prompt: offered, files: file, toolsUsed: ["WebSearch", "Write"] }));
    expect(failedIds(checks)).toEqual([]);
    expect(check(checks, "connection_used")?.ok).toBe(true);
    expect(check(checks, "connection_used")?.detail).toMatch(/mentioned, not required/i);
  });

  it("still reports the connection's tools when an optional connection was used anyway", () => {
    const checks = runChecks(input({ prompt: offered, files: file, toolsUsed: ["mcp__deepwiki__read_wiki_structure", "Write"] }));
    expect(failedIds(checks)).toEqual([]);
    expect(check(checks, "connection_used")?.detail).toMatch(/mcp__deepwiki__read_wiki_structure/);
  });

  it("fails a web-only run when the instructions say the connection must be used", () => {
    const must = "Write output.csv with area, what_it_does. You must use the connected DeepWiki server.";
    const checks = runChecks(input({ prompt: must, files: file, toolsUsed: ["WebFetch", "Write"] }));
    expect(failedIds(checks)).toContain("connection_used");
  });

  it("fails a web-only run when the instructions say to work only through the connection", () => {
    const only = "Write output.csv with area, what_it_does, using only the connected DeepWiki server.";
    const checks = runChecks(input({ prompt: only, files: file, toolsUsed: ["WebFetch", "Write"] }));
    expect(failedIds(checks)).toContain("connection_used");
  });
});

// Local run 9c1d8c15: the report-only /compare-concepts ("Write a short, plain-language answer") failed "A file was
// written: no file was written" though nothing asked for a file. "Write" alone is not a file; its object must be one.
describe("asksForFile", () => {
  it("does not read 'write' with no file as its object as a request for a file", () => {
    expect(asksForFile("Compare the two concepts. Write a short, plain-language answer.")).toBe(false);
    expect(asksForFile("Research the company and write what you found in the report.")).toBe(false);
  });

  it("reads a file named or typed, or a verb that can only mean a file, as a request for one", () => {
    expect(asksForFile("Write the results to a file.")).toBe(true);
    expect(asksForFile("Write them into news.csv.")).toBe(true);
    expect(asksForFile("Put the notes in summary.md")).toBe(true);
    expect(asksForFile("Write a CSV of the prices.")).toBe(true);
    expect(asksForFile("Save the table.")).toBe(true);
    expect(asksForFile("Export a spreadsheet of the orders.")).toBe(true);
  });

  it("fails no 'a file was written' check on a report-only run", () => {
    const checks = runChecks(input({ prompt: "Compare the two concepts. Write a short, plain-language answer.", report: "Here is the answer." }));
    expect(check(checks, "file_expected")).toBeUndefined();
  });
});

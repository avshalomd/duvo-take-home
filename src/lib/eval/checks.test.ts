import { describe, expect, it } from "vitest";
import type { EvaluateInput } from "@/contracts/eval";
import { runChecks } from "./checks";

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

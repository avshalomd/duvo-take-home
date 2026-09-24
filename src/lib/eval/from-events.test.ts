import { describe, expect, it } from "vitest";
import type { RunEvent } from "@/contracts/run";
import { spreadsheetsIn, whatItRead } from "./from-events";

const call = (seq: number, name: string, input: unknown): RunEvent => ({
  seq,
  at: "2026-09-24T10:00:00.000Z",
  kind: "tool_call",
  payload: { tool_use_id: `t${seq}`, name, input },
});

const result = (seq: number, id: string, preview: string, isError = false): RunEvent => ({
  seq,
  at: "2026-09-24T10:00:00.000Z",
  kind: "tool_result",
  payload: { tool_use_id: id, is_error: isError, preview },
});

// qa-ai F2: "the numbers and facts agree with what the run read" needs what it read in front of the judge.
describe("whatItRead", () => {
  it("gives the start of each page, search result and connection answer the run read, with the tool it came from", () => {
    const events = [
      call(1, "WebSearch", { query: "Norway holidays October 2026" }),
      result(2, "t1", "Norway public holidays 2026: none in October."),
      call(3, "mcp__deepwiki__ask_question", { q: "x" }),
      result(4, "t3", "The repo has 3 packages."),
    ];
    expect(whatItRead(events)).toEqual([
      { tool: "WebSearch", text: "Norway public holidays 2026: none in October." },
      { tool: "mcp__deepwiki__ask_question", text: "The repo has 3 packages." },
    ]);
  });

  it("leaves out our own tools, the run's own files and failed calls", () => {
    const events = [
      call(1, "mcp__plan__update_step", { index: 0, status: "done" }),
      result(2, "t1", "ok"),
      call(3, "Read", { file_path: "x.csv" }),
      result(4, "t3", "a,b"),
      call(5, "WebFetch", { url: "https://x.example" }),
      result(6, "t5", "403 Forbidden", true),
    ];
    expect(whatItRead(events)).toEqual([]);
  });
});

describe("spreadsheetsIn (qa-ai F1)", () => {
  it("reads each spreadsheet's sheets from the spreadsheet tool's calls", () => {
    const events = [
      call(1, "WebSearch", { query: "prices" }),
      call(2, "mcp__outputs__make_spreadsheet", { file: "prices.xlsx", sheets: [{ name: "Prices", columns: ["app", "eur"], rows: [["Teams", 5.6]] }] }),
    ];
    expect(spreadsheetsIn(events)).toEqual([{ file: "prices.xlsx", sheets: [{ name: "Prices", columns: ["app", "eur"], rows: [["Teams", 5.6]] }] }]);
  });

  it("keeps the last call for a file made twice: a fix writes it again under the same name", () => {
    const events = [
      call(1, "mcp__outputs__make_spreadsheet", { file: "p.xlsx", sheets: [{ name: "Old", columns: ["a"], rows: [] }] }),
      call(2, "mcp__outputs__make_spreadsheet", { file: "p.xlsx", sheets: [{ name: "New", columns: ["a"], rows: [] }] }),
    ];
    expect(spreadsheetsIn(events).map((s) => s.sheets[0].name)).toEqual(["New"]);
  });

  it("leaves out a call whose input is not a spreadsheet's", () => {
    expect(spreadsheetsIn([call(1, "mcp__outputs__make_spreadsheet", { file: "p.xlsx" })])).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import type { RunEvent } from "@/contracts/run";
import { spreadsheetsIn } from "./from-events";

const call = (seq: number, name: string, input: unknown): RunEvent => ({
  seq,
  at: "2026-09-24T10:00:00.000Z",
  kind: "tool_call",
  payload: { tool_use_id: `t${seq}`, name, input },
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

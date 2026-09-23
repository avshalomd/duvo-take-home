import { describe, expect, it } from "vitest";
import { csvLine, fileKind, flagLine, formatBytes, noFilesLine, sheetsLine, sheetsOf } from "./file-kind";

describe("fileKind - how a file is shown on the run", () => {
  it("previews a chart, cards a spreadsheet and lists everything else as a document", () => {
    expect(fileKind("sales.svg")).toBe("chart");
    expect(fileKind("Report.XLSX")).toBe("spreadsheet");
    expect(fileKind("output.csv")).toBe("document");
    expect(fileKind("notes.md")).toBe("document");
  });
});

describe("flagLine - what the output scan found, in one line", () => {
  it("lists the personal data it counted", () => {
    expect(flagLine([{ kind: "email", count: 12, detail: "12 email addresses" }])).toBe("Contains 12 email addresses");
    expect(
      flagLine([
        { kind: "email", count: 12, detail: "12 email addresses" },
        { kind: "phone", count: 1, detail: "1 phone number" },
        { kind: "iban", count: 2, detail: "2 IBANs" },
      ]),
    ).toBe("Contains 12 email addresses, 1 phone number and 2 IBANs");
  });

  it("leaves credentials out: a file with a key is held back and says so itself", () => {
    expect(flagLine([{ kind: "credential", count: 1, detail: "an API key on line 4" }])).toBeNull();
  });

  it("is null for a file with no flags", () => {
    expect(flagLine([])).toBeNull();
    expect(flagLine(undefined)).toBeNull();
  });
});

// Q99: "0.0 KB" said a 40-byte file was empty
describe("formatBytes - a file's size in the unit a person reads", () => {
  it("counts bytes under one kilobyte", () => {
    expect(formatBytes(1)).toBe("1 byte");
    expect(formatBytes(532)).toBe("532 bytes");
  });

  it("uses KB and MB above that, with one decimal", () => {
    expect(formatBytes(2867)).toBe("2.8 KB");
    expect(formatBytes(1_572_864)).toBe("1.5 MB");
  });
});

// Q100, Q122: one sentence for every state said "writes its answer in the report below" even mid-run or with no report
describe("noFilesLine - what the empty file area says, by the state of the run", () => {
  it("says files appear when a live run finishes", () => {
    for (const status of ["queued", "running", "evaluating"]) expect(noFilesLine(status, false)).toBe("Files appear here when the run finishes.");
  });

  it("points at the report when a finished run answered in words", () => {
    expect(noFilesLine("succeeded", true)).toBe("No files: the answer is in the report below.");
  });

  it("says plainly that a finished run made nothing", () => {
    expect(noFilesLine("succeeded", false)).toBe("This run made no files.");
  });

  it("says a stopped or broken run ended before it saved anything", () => {
    expect(noFilesLine("failed", false)).toBe("The run ended before it saved any files.");
    expect(noFilesLine("cancelled", true)).toBe("The run was stopped before it saved any files.");
  });
});

describe("csvLine - a CSV tile's one line of facts", () => {
  it("counts the rows and names the first columns", () => {
    expect(csvLine({ rows: 12, columns: ["title", "source", "url", "published_at", "summary"] })).toBe(
      "12 rows with title, source, url and 2 more columns",
    );
    expect(csvLine({ rows: 1, columns: ["name", "email"] })).toBe("1 row with name and email");
    expect(csvLine({ rows: 0, columns: ["name"] })).toBe("No rows, only the name column");
  });
});

describe("sheetsOf / sheetsLine - a spreadsheet tile names its sheets", () => {
  const call = (seq: number, file: string, sheets: { name: string; rows: unknown[][] }[]) => ({
    seq,
    at: "2026-09-23T09:00:00.000Z",
    kind: "tool_call" as const,
    payload: { tool_use_id: `t${seq}`, name: "mcp__outputs__make_spreadsheet", input: { file, sheets: sheets.map((s) => ({ ...s, columns: ["a"] })) } },
  });

  it("reads the sheets from the call that made the file, the latest one when it was made twice", () => {
    const events = [
      call(1, "table.xlsx", [{ name: "Draft", rows: [] }]),
      call(2, "table.xlsx", [
        { name: "Summary", rows: [[1], [2]] },
        { name: "Data", rows: [[1]] },
      ]),
    ];
    expect(sheetsOf(events, "table.xlsx")).toEqual([
      { name: "Summary", rows: 2 },
      { name: "Data", rows: 1 },
    ]);
    expect(sheetsOf(events, "other.xlsx")).toEqual([]);
  });

  it("says the sheets in words", () => {
    expect(
      sheetsLine([
        { name: "Summary", rows: 2 },
        { name: "Data", rows: 1 },
      ]),
    ).toBe("Sheets Summary (2 rows) and Data (1 row)");
    expect(sheetsLine([{ name: "Sheet1", rows: 40 }])).toBe("One sheet, Sheet1, with 40 rows");
    expect(sheetsLine([])).toBeNull();
  });
});

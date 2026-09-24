import { describe, expect, it } from "vitest";
import { HELD_BACK, forEvaluator, toFiles } from "./run-rows";

type FileRow = Parameters<typeof toFiles>[0][number];
const row = (over: Partial<FileRow>): FileRow => ({
  id: "f1",
  runId: "r1",
  name: "notes.md",
  mime: "text/markdown",
  bytes: 5,
  content: "hello",
  encoding: "utf8",
  flags: [],
  quarantined: false,
  createdAt: new Date("2026-09-23T08:00:00.000Z"),
  ...over,
});

describe("toFiles", () => {
  it("hands a spreadsheet's stored base64 to the evaluator, so its checks can read the file's signature", () => {
    const workbook = Buffer.from("PK\x03\x04 rest", "binary").toString("base64");
    const [file] = toFiles([row({ name: "data.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", encoding: "base64", content: workbook })]);
    expect(file).toEqual({ name: "data.xlsx", content: workbook });
  });

  it("hands a text file over as it is", () => {
    expect(toFiles([row({})])).toEqual([{ name: "notes.md", content: "hello" }]);
  });

  // Security review S8: a file the scan held back for a credential still went, whole, to the judges (third parties)
  it("hands a held-back file over as a placeholder, never its content", () => {
    const secret = "api_key=sk-live-0123456789abcdefghij";
    const [file] = toFiles([row({ name: "keys.txt", content: secret, quarantined: true })]);
    expect(file).toEqual({ name: "keys.txt", content: "(held back: contains a credential)" });
  });
});

describe("forEvaluator - what the live run hands the evaluator for each file it stored", () => {
  it("keeps a file the scan let through, and puts the placeholder in place of a held-back one", () => {
    expect(forEvaluator({ name: "a.csv", content: "x,y", quarantined: false })).toEqual({ name: "a.csv", content: "x,y" });
    expect(forEvaluator({ name: "b.md", content: "token ghp_x", quarantined: true })).toEqual({ name: "b.md", content: HELD_BACK });
  });
});

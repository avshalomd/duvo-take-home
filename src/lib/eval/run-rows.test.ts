import { describe, expect, it } from "vitest";
import type { Run, RunEvent } from "@/contracts/run";
import { toEvaluateInput, toFiles } from "./run-rows";

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

describe("toEvaluateInput", () => {
  const run: Run = {
    id: "r1", prompt: "Make prices.xlsx", status: "succeeded", model: "m", connectionIds: [], report: "Done.", error: null,
    numTurns: 3, durationMs: 1000, costUsd: 0.01, createdAt: "2026-09-24T10:00:00.000Z", finishedAt: "2026-09-24T10:01:00.000Z",
  };

  it("carries what the spreadsheet tool was given, so Re-evaluate shows the models the sheets (qa-ai F1)", () => {
    const events: RunEvent[] = [
      { seq: 1, at: run.createdAt, kind: "tool_call", payload: { tool_use_id: "t1", name: "mcp__outputs__make_spreadsheet", input: { file: "prices.xlsx", sheets: [{ name: "P", columns: ["a"], rows: [[1]] }] } } },
    ];
    expect(toEvaluateInput(run, events, []).spreadsheets).toEqual([{ file: "prices.xlsx", sheets: [{ name: "P", columns: ["a"], rows: [[1]] }] }]);
  });

  // qa-ai F8: a run from before the engine marked unticked steps is re-evaluated the way a new one is judged
  const planned: RunEvent = {
    seq: 1,
    at: run.createdAt,
    kind: "plan",
    payload: { intent: "x", expectedOutputs: [], sources: [], steps: [{ index: 0, title: "Look it up", status: "done" }, { index: 1, title: "Answer", status: "pending" }] },
  };

  it("marks the steps a finished run did not tick as not marked", () => {
    expect(toEvaluateInput(run, [planned], []).plan?.steps.map((s) => s.status)).toEqual(["done", "unmarked"]);
  });

  it("leaves a failed run's steps as they were: it did not finish", () => {
    expect(toEvaluateInput({ ...run, status: "failed" }, [planned], []).plan?.steps.map((s) => s.status)).toEqual(["done", "pending"]);
  });
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
});

import { describe, expect, it } from "vitest";
import { carryOverPrompt, followUpInstructions, REPORT_HEAD_CHARS, type ParentRun } from "./follow-up-prompt";

const parent: ParentRun = {
  prompt: "Fetch the latest AI news and save them into news.csv",
  report: "I searched the web and wrote 12 stories to news.csv.",
  files: [
    { name: "news.csv", bytes: 2048 },
    { name: "report.md", bytes: 512 },
  ],
};
const change = "Add a column with the source's country";

describe("carryOverPrompt", () => {
  it("quotes the parent's instructions and the change the user asked for", () => {
    const p = carryOverPrompt(parent, change);
    expect(p).toContain(parent.prompt);
    expect(p).toContain(change);
  });

  it("puts the change after the earlier run's context, so the last thing the agent reads is what to do now", () => {
    const p = carryOverPrompt(parent, change);
    expect(p.lastIndexOf(change)).toBeGreaterThan(p.indexOf(parent.prompt));
    expect(p.lastIndexOf(change)).toBeGreaterThan(p.indexOf(parent.report!));
  });

  it("lists the parent's files by name, as already in the working directory", () => {
    const p = carryOverPrompt(parent, change);
    expect(p).toContain("news.csv");
    expect(p).toContain("report.md");
    expect(p).toMatch(/working directory/i);
  });

  it("says so when the parent produced no files", () => {
    expect(carryOverPrompt({ ...parent, files: [] }, change)).toMatch(/no files/i);
  });

  it("carries the head of the parent's report", () => {
    expect(carryOverPrompt(parent, change)).toContain(parent.report);
  });

  it("keeps only the head of a long report, and marks the cut", () => {
    const long = "x".repeat(REPORT_HEAD_CHARS + 500);
    const p = carryOverPrompt({ ...parent, report: long }, change);
    expect(p).toContain("x".repeat(REPORT_HEAD_CHARS));
    expect(p).not.toContain("x".repeat(REPORT_HEAD_CHARS + 1));
    expect(p).toContain("...");
  });

  it("says there was no report when the parent ended without one", () => {
    expect(carryOverPrompt({ ...parent, report: null }, change)).toMatch(/no report/i);
  });

  it("tells the agent to write changed files back under the same names", () => {
    expect(carryOverPrompt(parent, change)).toMatch(/same name/i);
  });
});

describe("followUpInstructions", () => {
  it("gives the evaluator the original instructions and the change together, original first", () => {
    const s = followUpInstructions(parent.prompt, change);
    expect(s.indexOf(parent.prompt)).toBeGreaterThanOrEqual(0);
    expect(s.indexOf(change)).toBeGreaterThan(s.indexOf(parent.prompt));
  });
});

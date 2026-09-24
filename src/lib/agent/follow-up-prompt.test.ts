import { describe, expect, it } from "vitest";
import { carryOverPrompt, followUpInstructions, REPORT_HEAD_CHARS, type ParentRun } from "./follow-up-prompt";

const parent: ParentRun = {
  prompt: "Fetch the latest AI news and save them into news.csv",
  report: "I searched the web and wrote 12 stories to news.csv.",
  files: [
    { name: "news.csv", bytes: 2048 },
    { name: "report.md", bytes: 512 },
  ],
  plan: null,
  verdict: null,
  feedback: null,
};
const change = "Add a column with the source's country";

// His follow-up of 2026-09-23 (ef80fb8d, "fix the table"): the parent's CSV failed the check on row 7 (an unquoted
// comma), but the follow-up was never told, re-read the pages and reported the CSV "structurally fine".
const hisParent: ParentRun = {
  prompt: "top 10 hugging face models for Jev-like local use",
  report: "## Report\n\nI ranked 10 jev-family models for local use and wrote output.csv and report.md.",
  files: [
    { name: "output.csv", bytes: 2996 },
    { name: "report.md", bytes: 2755 },
  ],
  plan: {
    intent: "Find the top 10 Hugging Face models for local jev-like use",
    expectedOutputs: ["output.csv"],
    sources: ["WebSearch"],
    steps: [
      { index: 0, title: "Look up popular local-friendly models", status: "done", note: "Found the jev family on the Hub" },
      { index: 1, title: "Write the results to a table", status: "done", note: "Wrote output.csv and report.md" },
      { index: 2, title: "Add download counts", status: "skipped", note: "The Hub hides them for new models" },
    ],
  },
  verdict: "fail",
  feedback: "The CSV parses: output.csv: row 7 has 8 fields, the header has 7",
};

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

  // The follow-up's report is its run's report: judged against the whole thread, and what "Make an automation" reads.
  it("asks for the report as the answer to the whole task with the change made, not only the change", () => {
    for (const p of [carryOverPrompt(parent, change), carryOverPrompt(hisParent, "fix the table")]) {
      expect(p).toMatch(/answer to the whole task with this change made/i);
      expect(p).toMatch(/not only this change/i);
    }
  });

  // qa-ai F5: "I re-checked the file against your original request" and "One correction from the automatic check"
  // reached the person as the report.
  it("says the report never mentions the check, earlier runs or corrections, and gives no phrase to echo", () => {
    const p = carryOverPrompt(hisParent, "fix the table");
    expect(p).toMatch(/never mention the automatic check, an earlier run, a correction or re-checking/i);
    expect(p).not.toMatch(/as it now stands/i);
    expect(p).not.toMatch(/closing sentence/i);
  });
});

describe("carryOverPrompt: the earlier run's plan and its check (his words: the relevant info, the evaluator outputs)", () => {
  it("shows the earlier plan, each step with its status and note", () => {
    const p = carryOverPrompt(hisParent, "fix the table");
    expect(p).toContain("1. Look up popular local-friendly models - done: Found the jev family on the Hub");
    expect(p).toContain("3. Add download counts - skipped: The Hub hides them for new models");
  });

  it("carries what the automatic check found, saying it failed the result, before the change", () => {
    const p = carryOverPrompt(hisParent, "fix the table");
    expect(p).toContain("The automatic check failed that result.");
    expect(p).toContain("row 7 has 8 fields, the header has 7");
    expect(p.indexOf("row 7")).toBeLessThan(p.lastIndexOf("fix the table"));
  });

  it("asks the agent to fix what the check found and to check the files itself before it finishes", () => {
    expect(carryOverPrompt(hisParent, "fix the table")).toMatch(/fix what it found[\s\S]*check the files yourself/i);
  });

  it("says the check passed it with notes, and carries the notes, for a pass with notes", () => {
    const p = carryOverPrompt({ ...hisParent, verdict: "pass_with_notes", feedback: "The plan's last step was skipped" }, change);
    expect(p).toContain("The automatic check passed that result, with notes.");
    expect(p).toContain("The plan's last step was skipped");
  });

  it("says nothing about a check when the earlier result passed or was never checked", () => {
    expect(carryOverPrompt({ ...hisParent, verdict: "pass", feedback: "" }, change)).not.toMatch(/automatic check/);
    expect(carryOverPrompt({ ...hisParent, verdict: null, feedback: null }, change)).not.toMatch(/automatic check/);
  });

  it("says there was no plan when the earlier run set none", () => {
    expect(carryOverPrompt(parent, change)).toMatch(/set no plan/i);
  });
});

describe("followUpInstructions", () => {
  it("gives the evaluator the original instructions and the change together, original first", () => {
    const s = followUpInstructions(parent.prompt, change);
    expect(s.indexOf(parent.prompt)).toBeGreaterThanOrEqual(0);
    expect(s.indexOf(change)).toBeGreaterThan(s.indexOf(parent.prompt));
  });
});

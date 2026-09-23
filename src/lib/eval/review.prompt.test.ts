import { describe, expect, it } from "vitest";
import type { EvaluateInput } from "@/contracts/eval";
import { runChecks } from "./checks";
import { REVIEW_INSTRUCTIONS, reviewInput } from "./review.prompt";

const input: EvaluateInput = {
  prompt: "Make a spreadsheet of the prices and a short note.",
  runStatus: "succeeded",
  report: "Wrote data.xlsx and notes.md.",
  plan: null,
  files: [
    { name: "data.xlsx", content: Buffer.from("PK\x03\x04 the rest of the workbook", "binary").toString("base64") },
    { name: "notes.md", content: "Prices are list prices." },
  ],
  today: "2026-09-23",
};

describe("reviewInput", () => {
  it("shows the reviewer a spreadsheet as what it is and its size, never its base64", () => {
    const text = reviewInput(input, runChecks(input));
    expect(text).toContain("FILE data.xlsx");
    expect(text).toContain("(a spreadsheet file, 29 bytes)");
    expect(text).not.toContain(input.files[0].content);
  });

  it("shows a text file's own lines", () => {
    expect(reviewInput(input, runChecks(input))).toContain("Prices are list prices.");
  });

  // Q148: the reviewer failed a file for quoting a value the CSV check required quoted. Shown the checks, it can
  // see which rules are fixed.
  it("shows the reviewer the code checks the run passed, as fixed rules", () => {
    const csv: EvaluateInput = { ...input, files: [{ name: "labs.csv", content: 'name,hq\nDeepMind,"London, UK"\n' }] };
    const text = reviewInput(csv, runChecks(csv));
    expect(text).toMatch(/CHECKS/);
    expect(text).toContain("The CSV parses: labs.csv: 2 columns");
  });
});

describe("REVIEW_INSTRUCTIONS", () => {
  it("says the checks' rules are fixed, and never to ask for a change that would fail one", () => {
    expect(REVIEW_INSTRUCTIONS).toMatch(/never ask for a change that would (break|fail)/i);
  });

  it("says a valid file whose report explains an instruction it could not meet is finished and suitable", () => {
    expect(REVIEW_INSTRUCTIONS).toMatch(/valid file whose report says what was done instead and why/);
    expect(REVIEW_INSTRUCTIONS).toMatch(/finished and suitable/);
  });
});

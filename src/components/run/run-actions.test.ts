import { describe, expect, it } from "vitest";
import { canMakeAutomation, changeSuggestion } from "./run-actions";

// His call, 2026-09-23: on a result that did not pass, "Ask for a change" starts from what the check found
describe("changeSuggestion - the first words of a change to a result that did not pass", () => {
  it("asks to fix the verdict's first reason", () => {
    expect(changeSuggestion({ verdict: "fail", reasons: ["At least 8 rows: 3 rows.", "The CSV parses: row 4"] })).toBe(
      "Please fix what did not pass: At least 8 rows: 3 rows.",
    );
  });

  // qa-ai U10: "Please fix what did not pass: The CSV parses: countries.csv: ..." read as if the CSV parsed
  it("names what failed, not the check's pass label", () => {
    expect(changeSuggestion({ verdict: "fail", reasons: ["The CSV parses: countries.csv: row 5 has 6 fields, the header has 3"] })).toBe(
      "Please fix what did not pass: countries.csv could not be read as a table (row 5 has 6 values, the header has 3)",
    );
  });

  it("suggests nothing for a result that passed, a verdict without reasons, or no verdict", () => {
    expect(changeSuggestion({ verdict: "pass_with_notes", reasons: ["miles only"] })).toBeNull();
    expect(changeSuggestion({ verdict: "fail", reasons: [] })).toBeNull();
    expect(changeSuggestion(null)).toBeNull();
  });
});

// Q121: "Make an automation" was offered on a run whose result did not pass - an automation copies what a run did.
describe("canMakeAutomation - which runs are worth saving as an automation", () => {
  it("offers it for a finished run whose result passed, with or without notes", () => {
    expect(canMakeAutomation({ status: "succeeded", purpose: "adhoc" }, "pass")).toBe(true);
    expect(canMakeAutomation({ status: "succeeded", purpose: "followup" }, "pass_with_notes")).toBe(true);
  });

  it("does not offer it when the result did not pass, was not checked, or the run did not finish", () => {
    expect(canMakeAutomation({ status: "succeeded", purpose: "adhoc" }, "fail")).toBe(false);
    expect(canMakeAutomation({ status: "succeeded", purpose: "adhoc" }, "unknown")).toBe(false);
    expect(canMakeAutomation({ status: "succeeded", purpose: "adhoc" }, null)).toBe(false);
    expect(canMakeAutomation({ status: "failed", purpose: "adhoc" }, "pass")).toBe(false);
  });

  it("does not offer it for a run that already came from an automation", () => {
    for (const purpose of ["trial", "automation", "schedule"] as const)
      expect(canMakeAutomation({ status: "succeeded", purpose }, "pass")).toBe(false);
  });
});

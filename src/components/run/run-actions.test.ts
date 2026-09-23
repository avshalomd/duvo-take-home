import { describe, expect, it } from "vitest";
import { canMakeAutomation } from "./run-actions";

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

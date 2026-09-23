import { describe, expect, it } from "vitest";
import type { Verdict } from "@/contracts/eval";
import { exampleWhy } from "./why";

const base: Verdict = {
  verdict: "pass",
  checks: [
    { id: "file", label: "audit.md exists", ok: true, detail: "" },
    { id: "rows", label: "has sections", ok: true, detail: "" },
  ],
  judgment: { answeredQuery: 0.93, followedPlan: 0.9 },
  review: null,
  reasons: [],
  evaluatedAt: "2026-09-23T10:00:00.000Z",
};

describe("exampleWhy", () => {
  it("says nothing before the run is judged", () => {
    expect(exampleWhy(null)).toEqual([]);
  });

  it("gives the evaluator's reasons, at most two, in its own words", () => {
    const v = { ...base, verdict: "fail" as const, reasons: ["audit.md is missing", "The plan was not finished", "a third"] };
    expect(exampleWhy(v)).toEqual(["audit.md is missing", "The plan was not finished"]);
  });

  it("gives the reviewer's requested change when there are no reasons", () => {
    const v = { ...base, verdict: "pass_with_notes" as const, review: { taskFinished: true, responseSuitable: false, changeNeeded: "Add the News section", reasoning: "" } };
    expect(exampleWhy(v)).toEqual(["Add the News section"]);
  });

  it("says every check passed when nothing was wrong", () => {
    expect(exampleWhy(base)).toEqual(["All 2 checks passed."]);
  });

  it("says the result was not checked when the judge was unavailable", () => {
    expect(exampleWhy({ ...base, verdict: "unknown", checks: [] })).toEqual(["The automatic check was not available for this run."]);
  });
});

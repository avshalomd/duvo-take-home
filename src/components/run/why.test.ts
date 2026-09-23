import { describe, expect, it } from "vitest";
import type { Check, Verdict } from "@/contracts/eval";
import { whyLines } from "./why";

const check = (id: string, label: string, ok: boolean, detail = ""): Check => ({ id, label, ok, detail });
const AT = "2026-09-23T09:00:00.000Z";
const CHECKS = [
  check("parses", "The CSV parses", true, "output.csv: 5 columns"),
  check("rows", "At least 8 rows", true, "12 rows"),
  check("duplicates", "No duplicate URLs", true, "0 duplicates"),
];

// The three shapes the evaluator produces in v2, each recording which tiers ran and which one decided.
const PASS_BY_JUDGE: Verdict = {
  verdict: "pass",
  checks: CHECKS,
  judgment: { answeredQuery: 0.91, followedPlan: 0.88 },
  review: null,
  reasons: [],
  evaluatedAt: AT,
  decidedBy: "judge",
  path: ["checks", "judge"],
};

const NOTES_BY_REVIEW: Verdict = {
  verdict: "pass_with_notes",
  checks: CHECKS,
  judgment: { answeredQuery: 0.91, followedPlan: 0.62 },
  review: { taskFinished: true, responseSuitable: true, changeNeeded: null, reasoning: "Step 3 was skipped because the RSS feed was down." },
  reasons: ["Step 3 was skipped because the RSS feed was down."],
  evaluatedAt: AT,
  decidedBy: "review",
  path: ["checks", "judge", "review"],
};

const FAIL_BY_CHECKS: Verdict = {
  verdict: "fail",
  checks: [check("parses", "The CSV parses", false, "output.csv: row 4 has 3 columns"), check("rows", "At least 8 rows", true, "9 rows")],
  judgment: null,
  review: null,
  reasons: ["The CSV parses: output.csv: row 4 has 3 columns"],
  evaluatedAt: AT,
  decidedBy: "checks",
  path: ["checks"],
};

const text = (v: Verdict, tier: string) => whyLines(v, "succeeded").find((l) => l.tier === tier)?.text;

describe("whyLines - one plain line per tier that ran, in the order it ran", () => {
  it("gives the checks, the judge and the reviewer a line each when all three ran", () => {
    expect(whyLines(NOTES_BY_REVIEW, "succeeded").map((l) => l.tier)).toEqual(["checks", "judge", "review"]);
  });

  it("stops at the tier that ended the evaluation", () => {
    expect(whyLines(FAIL_BY_CHECKS, "succeeded").map((l) => l.tier)).toEqual(["checks"]);
    expect(whyLines(PASS_BY_JUDGE, "succeeded").map((l) => l.tier)).toEqual(["checks", "judge"]);
  });

  it("marks the tier that decided the outcome, and only that one", () => {
    expect(whyLines(NOTES_BY_REVIEW, "succeeded").map((l) => l.decided)).toEqual([false, false, true]);
    expect(whyLines(PASS_BY_JUDGE, "succeeded").map((l) => l.decided)).toEqual([false, true]);
  });
});

describe("whyLines - the checks", () => {
  it("names every check that passed", () => {
    expect(text(PASS_BY_JUDGE, "checks")).toBe("3 checks passed: the CSV parses, at least 8 rows, no duplicate URLs");
    expect(whyLines(PASS_BY_JUDGE, "succeeded")[0].tone).toBe("ok");
  });

  it("names the checks that failed and what was wrong", () => {
    expect(text(FAIL_BY_CHECKS, "checks")).toBe("1 of 2 checks failed: the CSV parses (output.csv: row 4 has 3 columns)");
    expect(whyLines(FAIL_BY_CHECKS, "succeeded")[0].tone).toBe("bad");
  });

  it("lower-cases each label inside the sentence, but not an acronym", () => {
    const labels: Verdict = {
      ...PASS_BY_JUDGE,
      checks: [check("a", "A report was written", true), check("b", "URLs are absolute", true), check("c", "CSV parses", true)],
    };
    expect(text(labels, "checks")).toBe("3 checks passed: a report was written, URLs are absolute, CSV parses");
  });

  it("says one check, not one checks", () => {
    const one: Verdict = { ...PASS_BY_JUDGE, checks: [CHECKS[0]] };
    expect(text(one, "checks")).toBe("1 check passed: the CSV parses");
  });

  it("says so when no automatic check applied to the run", () => {
    const none: Verdict = { ...PASS_BY_JUDGE, checks: [] };
    expect(text(none, "checks")).toBe("No automatic checks applied to this run");
  });
});

describe("whyLines - the judge's two answers, in words and never as numbers", () => {
  it("says the judge was sure of both when both answers cleared the bar", () => {
    expect(text(PASS_BY_JUDGE, "judge")).toBe("The judge was sure the result answers your instructions and that the plan was finished");
  });

  it("says which of the two the judge was not sure of", () => {
    expect(text(NOTES_BY_REVIEW, "judge")).toBe("The judge was sure the result answers your instructions but not that the plan was finished");
    const other: Verdict = { ...PASS_BY_JUDGE, judgment: { answeredQuery: 0.6, followedPlan: 0.9 } };
    expect(text(other, "judge")).toBe("The judge was sure the plan was finished but not that the result answers your instructions");
  });

  it("says when the judge was sure of neither", () => {
    const unsure: Verdict = { ...PASS_BY_JUDGE, judgment: { answeredQuery: 0.55, followedPlan: 0.7 } };
    expect(text(unsure, "judge")).toBe("The judge was not sure the result answers your instructions, nor that the plan was finished");
  });

  it("says when the judge was sure the result does not answer the instructions", () => {
    const no: Verdict = { ...PASS_BY_JUDGE, verdict: "fail", judgment: { answeredQuery: 0.1, followedPlan: 0.9 } };
    expect(text(no, "judge")).toBe("The judge was sure the result does not answer your instructions and that the plan was finished");
    expect(whyLines(no, "succeeded")[1].tone).toBe("bad");
  });

  it("colours the line by how sure the judge was", () => {
    expect(whyLines(PASS_BY_JUDGE, "succeeded")[1].tone).toBe("ok");
    expect(whyLines(NOTES_BY_REVIEW, "succeeded")[1].tone).toBe("warn");
  });

  it("never prints a probability: those belong in Details", () => {
    for (const v of [PASS_BY_JUDGE, NOTES_BY_REVIEW, FAIL_BY_CHECKS])
      for (const line of whyLines(v, "succeeded")) expect(line.text).not.toMatch(/%|0\.\d/);
  });

  it("says the judge could not be reached when it was asked and did not answer", () => {
    const down: Verdict = { ...PASS_BY_JUDGE, verdict: "unknown", judgment: null, decidedBy: "nobody", reasons: ["The judge was unavailable: 503"] };
    expect(text(down, "judge")).toBe("The judge could not be reached, so nobody checked whether the result answers your instructions");
    expect(whyLines(down, "succeeded")[1]).toMatchObject({ tone: "idle", decided: false });
  });
});

// v2: the judge's third answer, P(the run acted only on the person's instructions, not on text it read).
describe("whyLines - whether the run stayed within your instructions", () => {
  const bounds = (p: number | undefined): Verdict => ({ ...PASS_BY_JUDGE, judgment: { answeredQuery: 0.91, followedPlan: 0.88, stayedInBounds: p } });
  const judgeLines = (v: Verdict) => whyLines(v, "succeeded").filter((l) => l.tier === "judge");

  it("says nothing when the judge was sure the run kept to your instructions, or was not asked", () => {
    expect(judgeLines(bounds(0.95))).toHaveLength(1);
    expect(judgeLines(bounds(undefined))).toHaveLength(1);
  });

  it("adds a line when the judge was not sure the run kept to your instructions", () => {
    expect(judgeLines(bounds(0.6))[1]).toEqual({
      tier: "judge",
      tone: "warn",
      decided: false,
      text: "The run may have followed instructions it found on a page, not only yours",
    });
  });

  it("says it plainly when the judge was sure the run followed someone else's instructions", () => {
    expect(judgeLines(bounds(0.1))[1]).toMatchObject({
      tone: "bad",
      text: "The run followed instructions it found on a page, not only yours",
    });
  });
});

describe("whyLines - the reviewer", () => {
  it("says the reviewer found the run finished and usable, with its reasoning", () => {
    expect(text(NOTES_BY_REVIEW, "review")).toBe(
      'A reviewer read the whole run: finished and usable. "Step 3 was skipped because the RSS feed was down."',
    );
    expect(whyLines(NOTES_BY_REVIEW, "succeeded")[2].tone).toBe("ok");
  });

  it("says when the reviewer found the task unfinished, or finished but not usable", () => {
    const unfinished: Verdict = { ...NOTES_BY_REVIEW, verdict: "fail", review: { taskFinished: false, responseSuitable: false, changeNeeded: null, reasoning: "Only 3 of 8 rows." } };
    expect(text(unfinished, "review")).toBe('A reviewer read the whole run: not finished. "Only 3 of 8 rows."');
    const unusable: Verdict = { ...NOTES_BY_REVIEW, verdict: "fail", review: { taskFinished: true, responseSuitable: false, changeNeeded: "Add the dates", reasoning: "No dates." } };
    expect(text(unusable, "review")).toBe('A reviewer read the whole run: finished, but not usable as it is. "No dates."');
    expect(whyLines(unusable, "succeeded")[2].tone).toBe("bad");
  });

  it("shortens a long reasoning to one readable line", () => {
    const long: Verdict = { ...NOTES_BY_REVIEW, review: { ...NOTES_BY_REVIEW.review!, reasoning: "word ".repeat(80).trim() } };
    const line = text(long, "review")!;
    expect(line.length).toBeLessThan(260);
    expect(line).toMatch(/\.\.\."$/);
  });

  it("says when the reviewer was asked for a second reading and could not be reached", () => {
    const down: Verdict = { ...NOTES_BY_REVIEW, verdict: "unknown", review: null, decidedBy: "nobody" };
    expect(text(down, "review")).toBe("A reviewer was asked for a second reading but could not be reached");
  });
});

describe("whyLines - verdicts from v1, recorded before path and decidedBy existed", () => {
  it("works out the tiers from what the verdict holds", () => {
    const v1: Verdict = { ...PASS_BY_JUDGE, decidedBy: undefined, path: undefined };
    expect(whyLines(v1, "succeeded").map((l) => [l.tier, l.decided])).toEqual([
      ["checks", false],
      ["judge", true],
    ]);
  });

  it("credits a failed check with a fail the judge never saw", () => {
    const v1: Verdict = { ...FAIL_BY_CHECKS, decidedBy: undefined, path: undefined };
    expect(whyLines(v1, "succeeded").map((l) => [l.tier, l.decided])).toEqual([["checks", true]]);
  });

  it("credits the reviewer when there is a review", () => {
    const v1: Verdict = { ...NOTES_BY_REVIEW, decidedBy: undefined, path: undefined };
    expect(whyLines(v1, "succeeded").map((l) => l.tier)).toEqual(["checks", "judge", "review"]);
    expect(whyLines(v1, "succeeded")[2].decided).toBe(true);
  });
});

describe("whyLines - a run with no verdict", () => {
  // Q102: the outcome line and the failure banner already say it; a Why? that repeats them is noise
  it("has nothing to add for a stopped or a broken run, so Why? is not offered", () => {
    expect(whyLines(null, "cancelled")).toEqual([]);
    expect(whyLines(null, "failed")).toEqual([]);
  });

  it("says a finished run has not been checked yet", () => {
    expect(whyLines(null, "succeeded")[0].text).toBe("This run has not been checked");
  });

  it("has nothing to say while the run is still going", () => {
    expect(whyLines(null, "running")).toEqual([]);
    expect(whyLines(null, "evaluating")).toEqual([]);
  });

  // Q91: an older stored verdict does not parse any more, but its headline does: the outcome says "looks good",
  // so Why? may not say "not checked" - it says the result came from an earlier version of the checks
  it("agrees with the outcome of a run checked by an earlier version of the app", () => {
    expect(whyLines(null, "succeeded", "pass")).toEqual([
      { tier: "none", tone: "ok", decided: true, text: "Checked by an earlier version of the app, which kept the result but not the reasons" },
    ]);
    expect(whyLines(null, "succeeded", "fail")[0].tone).toBe("bad");
    expect(whyLines(null, "succeeded", "pass_with_notes")[0].tone).toBe("warn");
  });
});

// Auto-heal: the reasons of each attempt live here, never in the outcome line (his call, 2026-09-23)
describe("whyLines - a run that fixed what the check found", () => {
  const heals = [{ attempt: 1, max: 2, reasons: ["At least 8 rows: 3 rows", "The CSV parses: row 4 has 3 columns"] }];

  it("while the run fixes it, lists what the check found, as work in progress and not as a failure", () => {
    expect(whyLines(null, "running", null, heals)).toEqual([
      { tier: "heal", tone: "retry", decided: false, text: "The first result did not pass the check: At least 8 rows: 3 rows; The CSV parses: row 4 has 3 columns" },
    ]);
  });

  it("once it passed, notes how many attempts the fix took before the tiers of the final check", () => {
    const lines = whyLines(PASS_BY_JUDGE, "succeeded", "pass", heals);
    expect(lines.map((l) => l.text)).toContain("Fixed after 1 attempt");
    expect(lines.filter((l) => l.tier === "heal")).toHaveLength(2);
    expect(lines.slice(2).map((l) => l.tier)).toEqual(["checks", "judge"]);
  });

  it("after the last attempt failed, lists every attempt and then the final check, with no 'fixed' line", () => {
    const two = [...heals, { attempt: 2, max: 2, reasons: ["At least 8 rows: 6 rows"] }];
    const lines = whyLines(FAIL_BY_CHECKS, "succeeded", "fail", two);
    expect(lines.map((l) => l.text)).toEqual([
      "The first result did not pass the check: At least 8 rows: 3 rows; The CSV parses: row 4 has 3 columns",
      "The second result did not pass the check: At least 8 rows: 6 rows",
      expect.stringContaining("1 of 2 checks failed"),
    ]);
  });

  // Q148: the engine stopped trying because the last fix made no progress
  it("says plainly when the engine stopped trying, and counts only the fixes it made", () => {
    const stopped = [...heals, { attempt: 2, max: 2, reasons: ["At least 8 rows: 2 rows"], stopped: true }];
    const lines = whyLines(FAIL_BY_CHECKS, "succeeded", "fail", stopped);
    expect(lines.map((l) => l.text)).toContain("Stopped trying: the first fix did not get the result any closer to passing");
    expect(lines.map((l) => l.text)).not.toContain(expect.stringMatching(/^Fixed after/));
  });

  it("adds nothing for a run that never needed a fix", () => {
    expect(whyLines(PASS_BY_JUDGE, "succeeded", "pass", [])).toEqual(whyLines(PASS_BY_JUDGE, "succeeded", "pass"));
  });
});

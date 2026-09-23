import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate";
import { caseInput, loadCases, replayDeps } from "./suite-case";

// The offline suite, replayed (every `npm run check`): each recorded run in fixtures/runs/ goes through the real
// evaluate() with the judge's and the reviewer's recorded answers. No network, so what fails here is the CODE - a
// check, a threshold, the order of the tiers - never a provider's bad minute. The live run of the same cases is
// suite.eval.test.ts, and docs/EVAL.md carries both tables.
const cases = loadCases();

describe("the offline suite, replayed with the recorded answers", () => {
  it.each(cases.map((c) => [`${c.id} comes back ${c.expected.verdict}, decided by ${c.expected.decidedBy}`, c] as const))("%s", async (_, c) => {
    const verdict = await evaluate(caseInput(c), replayDeps(c));
    const why = `${c.id}: ${verdict.reasons.join(" | ")}`; // the reasons are what a person reads to see what went wrong
    expect({ verdict: verdict.verdict, decidedBy: verdict.decidedBy }, why).toEqual({ verdict: c.expected.verdict, decidedBy: c.expected.decidedBy });
    const failed = verdict.checks.filter((check) => !check.ok).map((check) => check.id);
    expect(failed.sort(), why).toEqual([...c.expected.failedChecks].sort());
  });

  it("covers every tier that can decide and every verdict a person can see", () => {
    const decidedBy = new Set(cases.map((c) => c.expected.decidedBy));
    const verdicts = new Set(cases.map((c) => c.expected.verdict));
    for (const tier of ["checks", "judge", "review"] as const) expect(decidedBy).toContain(tier);
    for (const v of ["pass", "pass_with_notes", "fail"] as const) expect(verdicts).toContain(v);
  });

  it("includes runs of a saved automation, so the template checks are in the suite", () => {
    expect(cases.filter((c) => c.template).length).toBeGreaterThanOrEqual(2);
  });
});

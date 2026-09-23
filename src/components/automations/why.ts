import type { Verdict } from "@/contracts/eval";

/**
 * The short "Why" under an example's outcome: at most two lines, in the evaluator's own words. The full verdict
 * (every check, the judge's numbers) stays in the run's details, one click away.
 */
export function exampleWhy(verdict: Verdict | null): string[] {
  if (!verdict) return []; // still running, or never judged
  if (verdict.verdict === "unknown") return ["The automatic check was not available for this run."];
  if (verdict.reasons.length > 0) return verdict.reasons.slice(0, 2);
  if (verdict.review?.changeNeeded) return [verdict.review.changeNeeded];
  if (verdict.checks.length > 0 && verdict.checks.every((c) => c.ok)) return [`All ${verdict.checks.length} checks passed.`];
  return [];
}

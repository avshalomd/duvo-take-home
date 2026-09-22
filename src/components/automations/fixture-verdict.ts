import type { Verdict } from "@/contracts/eval";
import runsFixture from "../../../fixtures/runs.json";

// TEMPORARY: GetRun does not return the stored verdict yet (contract request filed), so the panel reads the
// fixtures' evaluation block directly. One function, one import to delete when the contract carries it.
export function fixtureVerdict(runId: string): Verdict | null {
  const evaluation = runsFixture.find((r) => r.id === runId)?.evaluation;
  if (!evaluation) return null;
  return {
    verdict: evaluation.verdict as Verdict["verdict"],
    checks: evaluation.checks,
    judgment: null,
    review: null,
    reasons: evaluation.reason ? [evaluation.reason] : [],
    evaluatedAt: "",
  };
}

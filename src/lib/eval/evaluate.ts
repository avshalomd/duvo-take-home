import type { EvaluateInput, EvaluateRun, Judgment, Review, Verdict } from "@/contracts/eval";
import { isConfident } from "@/lib/llm/decide";
import { runChecks } from "./checks";
import { judgeRun } from "./judge";
import { reviewRun } from "./review";

// The cascade, cheapest first: code checks, then one decision-model call, then - only when that could not decide -
// one LLM review. Each tier can end the evaluation, so most runs never reach the expensive one.
//
// "Why?" (v2): every verdict records which tier produced it (decidedBy) and which tiers ran, in order (path), so the
// run page explains itself one line per tier instead of re-deriving the cascade from the probabilities.

export type EvaluateDeps = {
  judge: (input: EvaluateInput) => Promise<Judgment>;
  review: (input: EvaluateInput) => Promise<Review>;
};

// Jev's probabilities are calibrated, so the bar is set from the labelled runs, not by taste: the clean run comes
// back 0.89/0.84 and the genuinely ambiguous one 0.74/0.75, so 0.80 is what separates "call it" from "look again".
const CONFIDENT = 0.8;

export const evaluateRun: EvaluateRun = async (input) => evaluate(input, { judge: judgeRun, review: reviewRun });

export async function evaluate(input: EvaluateInput, deps: EvaluateDeps): Promise<Verdict> {
  const checks = runChecks(input);
  const failed = checks.filter((c) => !c.ok);
  const at = () => new Date().toISOString();
  // A failed check ends it here: no model is paid to look at an empty file, and the reason is already exact.
  if (failed.length) {
    const reasons = failed.map((c) => `${c.label}: ${c.detail}`);
    return { verdict: "fail", checks, judgment: null, review: null, reasons, evaluatedAt: at(), decidedBy: "checks", path: ["checks"] };
  }

  let judgment: Judgment;
  try {
    judgment = await deps.judge(input);
  } catch (e) {
    // "unknown", not "fail": the checks passed and nobody looked at the content. The UI offers Re-evaluate.
    // The judge stays on the path because it was tried: "Why?" says it was unavailable, not that it was skipped.
    const reasons = [`The judge was unavailable: ${message(e)}`];
    return { verdict: "unknown", checks, judgment: null, review: null, reasons, evaluatedAt: at(), decidedBy: "nobody", path: ["checks", "judge"] };
  }

  const answered = { type: "noul" as const, noul: judgment.answeredQuery };
  const followed = { type: "noul" as const, noul: judgment.followedPlan };
  if (isConfident(answered, CONFIDENT) && judgment.answeredQuery < 0.5) {
    const reason = `The files and report do not answer the instructions (${pct(1 - judgment.answeredQuery)} confident).`;
    return { verdict: "fail", checks, judgment, review: null, reasons: [reason], evaluatedAt: at(), decidedBy: "judge", path: ["checks", "judge"] };
  }
  // Did the run act only on the user's instructions? A doubt here is never a verdict on its own - a page quoted in
  // a summary is not an injection - so it sends the run to the reviewer, who reads the whole run. Optional: a
  // judgment recorded before the question existed carries no doubt about it.
  const bounds = judgment.stayedInBounds;
  const inBounds = bounds === undefined || (isConfident({ type: "noul", noul: bounds }, CONFIDENT) && bounds >= 0.5);
  if (isConfident(answered, CONFIDENT) && judgment.answeredQuery >= 0.5 && isConfident(followed, CONFIDENT) && judgment.followedPlan >= 0.5 && inBounds) {
    return { verdict: "pass", checks, judgment, review: null, reasons: [], evaluatedAt: at(), decidedBy: "judge", path: ["checks", "judge"] };
  }

  // Anything left is a judgment the cheap model could not make: the plan was not followed, it was unsure, or the run
  // may have taken orders from something it read.
  const unsure = [
    !isConfident(answered, CONFIDENT) ? `The judge was unsure whether the work answers the instructions (${pct(judgment.answeredQuery)}).` : "",
    judgment.followedPlan < 0.5 ? `The judge doubts the run did what it set out to do (${pct(1 - judgment.followedPlan)} confident).` : "",
    isConfident(answered, CONFIDENT) && !isConfident(followed, CONFIDENT) ? `The judge was unsure the run finished its plan (${pct(judgment.followedPlan)}).` : "",
    !inBounds ? `The run may have followed instructions it read on a page (the judge was ${pct(bounds ?? 0)} sure it kept to yours).` : "",
  ].filter(Boolean);

  const path: Verdict["path"] = ["checks", "judge", "review"];
  let review: Review;
  try {
    review = await deps.review(input);
  } catch (e) {
    const reasons = [...unsure, `The reviewer was unavailable: ${message(e)}`];
    return { verdict: "unknown", checks, judgment, review: null, reasons, evaluatedAt: at(), decidedBy: "nobody", path };
  }
  if (!review.taskFinished) {
    const reasons = [...unsure, `The task was not finished: ${review.reasoning}`];
    return { verdict: "fail", checks, judgment, review, reasons, evaluatedAt: at(), decidedBy: "review", path };
  }
  if (!review.responseSuitable) {
    return { verdict: "fail", checks, judgment, review, reasons: [...unsure, review.changeNeeded ?? review.reasoning], evaluatedAt: at(), decidedBy: "review", path };
  }
  // Finished and usable, but nobody was sure enough to call it clean: pass, with the reviewer's note attached.
  return { verdict: "pass_with_notes", checks, judgment, review, reasons: [review.reasoning, ...unsure], evaluatedAt: at(), decidedBy: "review", path };
}

const pct = (p: number) => `${Math.round(p * 100)}%`;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

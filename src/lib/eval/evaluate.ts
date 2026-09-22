import type { EvaluateInput, EvaluateRun, Judgment, Review, Verdict } from "@/contracts/eval";
import { isConfident } from "@/lib/llm/decide";
import { runChecks } from "./checks";
import { judgeRun } from "./judge";
import { reviewRun } from "./review";

// The cascade, cheapest first: code checks, then one decision-model call, then - only when that could not decide -
// one LLM review. Each tier can end the evaluation, so most runs never reach the expensive one.

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
    return { verdict: "fail", checks, judgment: null, review: null, reasons: failed.map((c) => `${c.label}: ${c.detail}`), evaluatedAt: at() };
  }

  let judgment: Judgment;
  try {
    judgment = await deps.judge(input);
  } catch (e) {
    // "unknown", not "fail": the checks passed and nobody looked at the content. The UI offers Re-evaluate.
    return { verdict: "unknown", checks, judgment: null, review: null, reasons: [`The judge was unavailable: ${message(e)}`], evaluatedAt: at() };
  }

  const answered = { type: "noul" as const, noul: judgment.answeredQuery };
  const followed = { type: "noul" as const, noul: judgment.followedPlan };
  if (isConfident(answered, CONFIDENT) && judgment.answeredQuery < 0.5) {
    const reason = `The files and report do not answer the instructions (${pct(1 - judgment.answeredQuery)} confident).`;
    return { verdict: "fail", checks, judgment, review: null, reasons: [reason], evaluatedAt: at() };
  }
  if (isConfident(answered, CONFIDENT) && judgment.answeredQuery >= 0.5 && isConfident(followed, CONFIDENT) && judgment.followedPlan >= 0.5) {
    return { verdict: "pass", checks, judgment, review: null, reasons: [], evaluatedAt: at() };
  }

  // Anything left is a judgment the cheap model could not make: the plan was not followed, or it was unsure.
  const unsure = [
    !isConfident(answered, CONFIDENT) ? `The judge was unsure whether the work answers the instructions (${pct(judgment.answeredQuery)}).` : "",
    judgment.followedPlan < 0.5 ? `The judge doubts the run did what it set out to do (${pct(1 - judgment.followedPlan)} confident).` : "",
    isConfident(answered, CONFIDENT) && !isConfident(followed, CONFIDENT) ? `The judge was unsure the run finished its plan (${pct(judgment.followedPlan)}).` : "",
  ].filter(Boolean);

  let review: Review;
  try {
    review = await deps.review(input);
  } catch (e) {
    return { verdict: "unknown", checks, judgment, review: null, reasons: [...unsure, `The reviewer was unavailable: ${message(e)}`], evaluatedAt: at() };
  }
  if (!review.taskFinished) {
    return { verdict: "fail", checks, judgment, review, reasons: [...unsure, `The task was not finished: ${review.reasoning}`], evaluatedAt: at() };
  }
  if (!review.responseSuitable) {
    return { verdict: "fail", checks, judgment, review, reasons: [...unsure, review.changeNeeded ?? review.reasoning], evaluatedAt: at() };
  }
  // Finished and usable, but nobody was sure enough to call it clean: pass, with the reviewer's note attached.
  return { verdict: "pass_with_notes", checks, judgment, review, reasons: [review.reasoning, ...unsure], evaluatedAt: at() };
}

const pct = (p: number) => `${Math.round(p * 100)}%`;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

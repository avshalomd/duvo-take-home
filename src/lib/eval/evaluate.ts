import type { Check, Deadline, EvaluateInput, EvaluateRun, Judgment, Review, Verdict } from "@/contracts/eval";
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
  judge: (input: EvaluateInput, deadline?: Deadline) => Promise<Judgment>;
  review: (input: EvaluateInput, checks: Check[], deadline?: Deadline) => Promise<Review>; // the checks it passed: rules it must not undo (Q148)
};

// Inside a time box, the judge gets the box less this and the reviewer the whole box: the judge's routes can never
// spend the reviewer's time (engine review #1). Of the run's 50 s that leaves the judge 30 s, 10 s per route on three.
export const REVIEW_SHARE_MS = 20_000;

// Jev's probabilities are calibrated, so the bar is set from the labelled runs, not by taste: the clean run comes
// back 0.89/0.84 and the genuinely ambiguous one 0.74/0.75, so 0.80 is what separates "call it" from "look again".
export const CONFIDENT = 0.8; // exported: the feedback to the agent names a doubt at the same bar (feedback.ts)
export const FACTS_BAR = 0.5; // factsAgree below this is a doubt (qa-ai F2); Why? says so at the same bar

// qa-ai F3: what a run that did not do the work did instead, as its outcome - neutral, never a fail, never healed.
type Refusal = "cannot_do" | "needs_answer";
const REFUSAL: Record<"cannot_be_done" | "needs_information", Refusal> = { cannot_be_done: "cannot_do", needs_information: "needs_answer" };
const REFUSAL_REASON: Record<Refusal, string> = {
  cannot_do: "The run explained why the task cannot be done here.",
  needs_answer: "The run needs an answer from you before it can do the task.",
};

export const evaluateRun: EvaluateRun = async (input, opts) => evaluate(input, { judge: judgeRun, review: reviewRun }, opts);

export async function evaluate(input: EvaluateInput, deps: EvaluateDeps, opts: { withinMs?: number } = {}): Promise<Verdict> {
  const endsAt = opts.withinMs === undefined ? undefined : Date.now() + opts.withinMs; // no box: each tier's own timeouts
  const judgeDeadline = endsAt === undefined ? undefined : { endsAt: endsAt - REVIEW_SHARE_MS };
  const checks = runChecks(input);
  const failed = checks.filter((c) => !c.ok);
  const at = () => new Date().toISOString();
  // A failed check ends it here: no model is paid to look at an empty file, and the reason is already exact.
  if (failed.length) {
    // One exception (qa-ai F3): a truthful refusal writes no file, so when the missing file is the only failure the
    // judge is asked what the run did. A confident refusal is its outcome; anything else leaves the checks' fail.
    if (input.runStatus === "succeeded" && failed.every((c) => c.id === "file_expected")) {
      const judgment = await deps.judge(input, judgeDeadline).catch(() => null);
      const refusal = judgment ? confidentRefusal(judgment) : null;
      if (judgment && refusal) {
        return { verdict: refusal, checks, judgment, review: null, reasons: [REFUSAL_REASON[refusal]], evaluatedAt: at(), decidedBy: "judge", path: ["checks", "judge"] };
      }
    }
    const reasons = failed.map((c) => `${c.label}: ${c.detail}`);
    return { verdict: "fail", checks, judgment: null, review: null, reasons, evaluatedAt: at(), decidedBy: "checks", path: ["checks"] };
  }

  let judgment: Judgment;
  try {
    judgment = await deps.judge(input, judgeDeadline);
  } catch (e) {
    // "unknown", not "fail": the checks passed and nobody looked at the content. The UI offers Re-evaluate.
    // The judge stays on the path because it was tried: "Why?" says it was unavailable, not that it was skipped.
    const reasons = [`The judge was unavailable: ${message(e)}`];
    return { verdict: "unknown", checks, judgment: null, review: null, reasons, evaluatedAt: at(), decidedBy: "nobody", path: ["checks", "judge"] };
  }

  // What the run did with the instructions comes first: a sure "cannot be done here" or "needs your answer" is not
  // a result to hold to the instructions, and the other answers (a refusal does not "answer" them) would fail it.
  const refusal = confidentRefusal(judgment);
  if (refusal) {
    return { verdict: refusal, checks, judgment, review: null, reasons: [REFUSAL_REASON[refusal]], evaluatedAt: at(), decidedBy: "judge", path: ["checks", "judge"] };
  }

  const answered = judgment.answeredQuery;
  // A doubt about staying in bounds or about the facts is never a verdict on its own - a page quoted in a summary is
  // not an injection, and Jev cannot know the world - so it sends the run to the reviewer, who reads the whole run.
  // Optional: a judgment recorded before a question existed carries no doubt about it.
  const inBounds = judgment.stayedInBounds === undefined || sureYes(judgment.stayedInBounds);
  // The facts question sends a run on only when Jev leans to no: it sees only the start of what a run read, and clean
  // runs came back 0.65-0.77 on it in the live suite while the wrong chart came back 0.03.
  const factsAgree = judgment.factsAgree === undefined || judgment.factsAgree >= FACTS_BAR;
  const sure = sureYes(answered) && sureYes(judgment.followedPlan) && inBounds && factsAgree;
  // qa-ai F2 (the owner's call): a plain question answered with numbers or facts and no file always gets the reviewer's
  // reading, which recomputes and checks them; a sure judge cannot tell a right number from a wrong one.
  const factsToCheck = input.files.length === 0 && judgment.statesFacts !== undefined && judgment.statesFacts >= 0.5;
  if (sure && !factsToCheck) {
    return { verdict: "pass", checks, judgment, review: null, reasons: [], evaluatedAt: at(), decidedBy: "judge", path: ["checks", "judge"] };
  }

  // Anything left is a judgment the cheap model could not make, or one it must not make alone. Since qa-ai F4 that
  // includes a sure "does not answer the instructions": its only feedback was "check the result against them", which
  // no heal could act on, and it failed truthful refusals at 95%. The reviewer's fail names the change to make.
  const lean = judgment.handling && judgment.handling.choice !== "did_work" ? judgment.handling : null;
  const unsure = [
    !isConfident(noul(answered), CONFIDENT) ? `A first check could not tell whether the work answers the instructions (${pct(answered)}).` : "",
    isConfident(noul(answered), CONFIDENT) && answered < 0.5 ? `A first check found the work may not answer the instructions (${pct(1 - answered)} sure).` : "",
    judgment.followedPlan < 0.5 ? `A first check doubts the run did what it set out to do (${pct(1 - judgment.followedPlan)} sure).` : "",
    isConfident(noul(answered), CONFIDENT) && !isConfident(noul(judgment.followedPlan), CONFIDENT) ? `A first check was unsure the run finished its plan (${pct(judgment.followedPlan)}).` : "",
    !inBounds ? `The run may have followed instructions it read on a page (the check was ${pct(judgment.stayedInBounds ?? 0)} sure it kept to yours).` : "",
    !factsAgree ? `Some numbers or facts may not agree with the instructions or the sources (${pct(judgment.factsAgree ?? 0)} sure they do).` : "",
    factsToCheck ? "The answer rests on numbers or facts, so it was read closely." : "",
    lean ? `The run may not have done the task: it seems to ${lean.choice === "cannot_be_done" ? "say it cannot be done" : "ask you for something"} (${pct(lean.confidence)}).` : "",
  ].filter(Boolean);

  const path: Verdict["path"] = ["checks", "judge", "review"];
  let review: Review;
  try {
    review = await deps.review(input, checks, endsAt === undefined ? undefined : { endsAt });
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
  // The reviewer found it right. A run that leaned to a refusal is that refusal, confirmed (F3); a run the judge was
  // sure of and only sent for its facts is a plain pass (F2): nobody was unsure of it.
  if (lean) {
    const kind = REFUSAL[lean.choice as keyof typeof REFUSAL];
    return { verdict: kind, checks, judgment, review, reasons: [REFUSAL_REASON[kind], review.reasoning], evaluatedAt: at(), decidedBy: "review", path };
  }
  if (sure) return { verdict: "pass", checks, judgment, review, reasons: [], evaluatedAt: at(), decidedBy: "review", path };
  // Finished and usable, but nobody was sure enough to call it clean: pass, with the reviewer's note attached.
  return { verdict: "pass_with_notes", checks, judgment, review, reasons: [review.reasoning, ...unsure], evaluatedAt: at(), decidedBy: "review", path };
}

/** "cannot_do" or "needs_answer" when the judge is sure the run did one of those instead of the work. */
function confidentRefusal(j: Judgment): Refusal | null {
  const h = j.handling;
  if (!h || h.choice === "did_work" || h.confidence < CONFIDENT) return null;
  return REFUSAL[h.choice];
}

const noul = (p: number) => ({ type: "noul" as const, noul: p });
const sureYes = (p: number) => p >= 0.5 && isConfident(noul(p), CONFIDENT);
const pct = (p: number) => `${Math.round(p * 100)}%`;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

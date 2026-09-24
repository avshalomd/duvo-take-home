import { createHash } from "node:crypto";
import type { Verdict } from "@/contracts/eval";

// Auto-heal (his call, 2026-09-23): when the evaluator fails a run's result, the same agent session gets the findings
// and fixes its own result, inside the same run, at most the workspace's number of times. The run says pass or fail
// only once its tries are over.

export const MIN_HEAL_MS = 60_000; // a shorter attempt would be cut off half way by the wall clock

// Inline or in the runner route, a run lives inside one function call, and Vercel ends that call at 300 s whatever it
// is doing: a run still evaluating then stayed "evaluating" for ever. So everything that follows the agent's last
// attempt is boxed in time, and the agent gets what is left of the 300 s:
//   300 s (the function) - 50 s (the evaluation) - 10 s (step checks still out) - 10 s (files and closing writes) = 230 s
export const FUNCTION_LIMIT_MS = 300_000; // the runner route's maxDuration
export const EVAL_MAX_MS = 50_000; // the judge (up to 3 routes) and the reviewer; later, the run says "not checked"
export const SETTLE_MAX_MS = 10_000; // a step check still waiting on Jev after this is dropped
export const CLOSING_MS = 10_000; // storing the files, the SDK's totals for a run closed early, the closing update

/**
 * How long a run may spend on the agent, all attempts together. Inline or in the runner route, every attempt shares
 * the one function call's 230 s (above). In the worker there is no function limit, but a job locked for 10 minutes
 * is taken for dead (recover.ts): 6 minutes leaves room for the evaluations.
 */
export function runBudgetMs(mode: "inline" | "queue" | "route"): number {
  return mode === "queue" ? 6 * 60_000 : FUNCTION_LIMIT_MS - EVAL_MAX_MS - SETTLE_MAX_MS - CLOSING_MS;
}

/** Whether a run the evaluator failed gets another attempt. */
export function shouldHeal(args: { healable: boolean; healsSoFar: number; limit: number; remainingMs: number }): boolean {
  return args.healable && args.healsSoFar < args.limit && args.remainingMs >= MIN_HEAL_MS; // limit 0: never
}

/** What an attempt left: its failures and its files, reduced to strings an earlier attempt can be compared with. */
export type AttemptFingerprint = { reasons: string; checks: string; files: string };

/**
 * Failures as the evaluator stated them (the failed code checks with their details, and the verdict's reasons without
 * their percentages), and the files as a hash of their names and exact bytes, in name order so the same files always
 * read the same.
 */
export function attemptFingerprint(verdict: Verdict, files: { name: string; content: string }[]): AttemptFingerprint {
  const checks = verdict.checks
    .filter((c) => !c.ok)
    .map((c) => `${c.id}: ${c.detail}`)
    .sort()
    .join("\n");
  const hash = createHash("sha256");
  for (const f of [...files].sort((a, b) => a.name.localeCompare(b.name))) hash.update(`${f.name}\0${f.content}\0`);
  // The judge's reasons carry its probability ("(93% confident)"), which moves on every attempt: with the numbers left
  // out, the same "no" from the judge reads as the same failure (engine review #17).
  const reasons = verdict.reasons.map((r) => r.replace(/\d+(\.\d+)?%/g, "%")).sort();
  return { reasons: reasons.join("\n"), checks, files: hash.digest("hex") };
}

/**
 * Why healing should stop because this attempt made no progress over an earlier one, or null to go on (QA Q148: the
 * live heal of 2026-09-23 put quotes in for the CSV check, took them out for the reviewer, and was back at the start).
 * The files are compared first: the same bytes again is the plainest proof that a fix was undone.
 */
export function noProgress(current: AttemptFingerprint, earlier: AttemptFingerprint[]): string | null {
  if (earlier.some((e) => e.files === current.files)) {
    return "The fix undid an earlier one: the files are back to an earlier attempt's, so healing stopped here.";
  }
  const sameChecks = current.checks !== "" && earlier.some((e) => e.checks === current.checks);
  const sameReasons = current.reasons !== "" && earlier.some((e) => e.reasons === current.reasons);
  if (sameChecks || sameReasons) return "This attempt failed the same way as an earlier one, so healing stopped here.";
  return null;
}

/**
 * The prompt of a heal attempt. feedbackForAgent already says what failed and ends with what to do, so it is used as
 * it is (QA Q149); only what the session does not know from it is added: where the files are, the plan tool, and
 * what the report must be. The attempt's last message becomes the run's report - the one the person reads, the
 * evaluator judges and a follow-up or "Make an automation" builds on - so it is the whole task's, not the fix's.
 */
export function healPrompt(feedback: string): string {
  return [
    feedback,
    "",
    "Your files are still in your working directory: write each one you change back under the same name, and check " +
      "them yourself before you finish.",
    "",
    // qa-ai F14: a re-marked step read "Explain that the request is too ambiguous" over a note about the list the fix
    // made. The plan stays as it is; the fix is shown as its own step, titled by the agent.
    "Keep your plan as it is and do not call mcp__plan__set_plan again. Leave the steps already done as they are: " +
      "their titles say what they did the first time. You may mark a step that is not done yet with " +
      "mcp__plan__update_step. When the fix is done, call mcp__plan__describe_fix once with a title of a few plain " +
      'words saying what you changed ("Put the unit in the axis title"), shown as its own step after the plan.',
    "",
    // qa-ai F5: the words of this line came back as the report's heading ("Report on the whole task as it now
    // stands:") and its last sentence ("One correction from the automatic check..."), so it gives no phrase to echo.
    "Then end with your report for the person, written as your answer to the whole task - what you did, what the " +
      "files hold and anything you could not do - not a note of the fix. The person reads it as the answer: never " +
      "mention the check, this pass, a correction, re-checking or an earlier attempt, and give it no heading.",
  ].join("\n");
}

import { createHash } from "node:crypto";
import { AgentLimits } from "@/contracts/agent";
import type { Verdict } from "@/contracts/eval";

// Auto-heal (his call, 2026-09-23): when the evaluator fails a run's result, the same agent session gets the findings
// and fixes its own result, inside the same run, at most the workspace's number of times. The run says pass or fail
// only once its tries are over.

export const MIN_HEAL_MS = 60_000; // a shorter attempt would be cut off half way by the wall clock

/**
 * How long a run may spend on the agent, all attempts together. Inline or in the runner route, the run lives inside
 * one function call (300 s on Vercel), so every attempt shares the one wall clock. In the worker there is no function limit, but a
 * job locked for 10 minutes is taken for dead (recover.ts): 6 minutes leaves room for the evaluations.
 */
export function runBudgetMs(mode: "inline" | "queue" | "route"): number {
  return mode === "queue" ? 6 * 60_000 : AgentLimits.wallClockMs;
}

/** Whether a run the evaluator failed gets another attempt. */
export function shouldHeal(args: { healable: boolean; healsSoFar: number; limit: number; remainingMs: number }): boolean {
  return args.healable && args.healsSoFar < args.limit && args.remainingMs >= MIN_HEAL_MS; // limit 0: never
}

/** What an attempt left: its failures and its files, reduced to strings an earlier attempt can be compared with. */
export type AttemptFingerprint = { reasons: string; checks: string; files: string };

/**
 * Failures as the evaluator stated them (the failed code checks with their details, and the verdict's reasons), and
 * the files as a hash of their names and exact bytes, in name order so the same files always read the same.
 */
export function attemptFingerprint(verdict: Verdict, files: { name: string; content: string }[]): AttemptFingerprint {
  const checks = verdict.checks
    .filter((c) => !c.ok)
    .map((c) => `${c.id}: ${c.detail}`)
    .sort()
    .join("\n");
  const hash = createHash("sha256");
  for (const f of [...files].sort((a, b) => a.name.localeCompare(b.name))) hash.update(`${f.name}\0${f.content}\0`);
  return { reasons: [...verdict.reasons].sort().join("\n"), checks, files: hash.digest("hex") };
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
 * it is (QA Q149); only what the session does not know from it is added: where the files are, and the plan tool.
 */
export function healPrompt(feedback: string): string {
  return [
    feedback,
    "",
    "Your files are still in your working directory: write each one you change back under the same name. Mark the " +
      "steps you redo with mcp__plan__update_step (running, then done with a note of what you fixed), and check the " +
      "files yourself before you finish.",
  ].join("\n");
}

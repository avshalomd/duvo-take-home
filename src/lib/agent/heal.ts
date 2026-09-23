import { AgentLimits } from "@/contracts/agent";
import type { Verdict } from "@/contracts/eval";

// Auto-heal (his call, 2026-09-23): when the evaluator fails a run's result, the same agent session gets the findings
// and fixes its own result, inside the same run, at most the workspace's number of times. The run says pass or fail
// only once its tries are over.

export const MIN_HEAL_MS = 60_000; // a shorter attempt would be cut off half way by the wall clock

/**
 * How long a run may spend on the agent, all attempts together. Inline, the run lives inside one function call
 * (300 s on Vercel), so every attempt shares the one wall clock. In the worker there is no function limit, but a
 * job locked for 10 minutes is taken for dead (recover.ts): 6 minutes leaves room for the evaluations.
 */
export function runBudgetMs(mode: "inline" | "queue"): number {
  return mode === "queue" ? 6 * 60_000 : AgentLimits.wallClockMs;
}

/** Whether a run the evaluator failed gets another attempt. */
export function shouldHeal(args: { healable: boolean; healsSoFar: number; limit: number; remainingMs: number }): boolean {
  return args.healable && args.healsSoFar < args.limit && args.remainingMs >= MIN_HEAL_MS; // limit 0: never
}

/** What an attempt left: its failures and its files, reduced to strings an earlier attempt can be compared with. */
export type AttemptFingerprint = { reasons: string; checks: string; files: string };

export function attemptFingerprint(verdict: Verdict, files: { name: string; content: string }[]): AttemptFingerprint {
  throw new Error(`not implemented: attemptFingerprint(${verdict.verdict}, ${files.length})`);
}

/** Why healing should stop because this attempt made no progress over an earlier one, or null to go on. */
export function noProgress(current: AttemptFingerprint, earlier: AttemptFingerprint[]): string | null {
  throw new Error(`not implemented: noProgress(${current.files.length}, ${earlier.length})`);
}

/** The prompt of a heal attempt: the evaluator's findings, and what to do about them. The session holds the rest. */
export function healPrompt(feedback: string): string {
  return [
    "The automatic check of your result failed. What it found:",
    "<check-findings>",
    feedback,
    "</check-findings>",
    "Fix this now. Your files are still in your working directory: read the ones the findings name, correct them, and " +
      "write each back under the same name. Mark the steps you redo with mcp__plan__update_step (running, then done " +
      "with a note of what you fixed). Check the files yourself before you finish, then report again: what was wrong " +
      "and what you changed.",
  ].join("\n");
}

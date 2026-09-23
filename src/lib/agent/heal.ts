export const MIN_HEAL_MS = 60_000;

/** How long a run may spend on the agent, all attempts together. */
export function runBudgetMs(mode: "inline" | "queue"): number {
  throw new Error(`not implemented: runBudgetMs(${mode})`);
}

/** Whether a run the evaluator failed gets another attempt. */
export function shouldHeal(args: { healable: boolean; healsSoFar: number; limit: number; remainingMs: number }): boolean {
  throw new Error(`not implemented: shouldHeal(${args.healsSoFar})`);
}

/** The prompt of a heal attempt: the evaluator's findings, and what to do about them. */
export function healPrompt(feedback: string): string {
  throw new Error(`not implemented: healPrompt(${feedback.length})`);
}

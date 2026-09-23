/** The earlier run a follow-up continues, as much of it as the new prompt carries over. */
export type ParentRun = {
  prompt: string;
  report: string | null;
  files: { name: string; bytes: number }[];
};

export const REPORT_HEAD_CHARS = 1500;

/** The follow-up's prompt: the parent's instructions, what it produced and its report head, then the change. */
export function carryOverPrompt(parent: ParentRun, change: string): string {
  throw new Error(`not implemented: carryOverPrompt(${parent.prompt.length}, ${change.length})`);
}

/** What the evaluator and the step checks judge a follow-up against: the original instructions plus the change. */
export function followUpInstructions(parentPrompt: string, change: string): string {
  throw new Error(`not implemented: followUpInstructions(${parentPrompt.length}, ${change.length})`);
}

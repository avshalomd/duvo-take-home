import type { Plan } from "@/contracts/run";

// "3 of 5 steps" over a thin bar: the one number that says how far a run got.
export function planProgress(
  plan: Plan | null,
): { done: number; total: number; percent: number; label: string } | null {
  const total = plan?.steps.length ?? 0;
  if (!plan || total === 0) return null;

  // a skipped step is settled, not outstanding: the bar tracks what is left to do, not what succeeded
  const done = plan.steps.filter((s) => s.status === "done" || s.status === "skipped").length;
  return { done, total, percent: Math.round((done / total) * 100), label: `${done} of ${total} steps` };
}

// The colour of that bar. It answers "how far", so it may not also claim "and it went well".
export type BarTone = "pass" | "warn" | "neutral";

export function barTone(verdict: string | null | undefined, anyDone: boolean): BarTone {
  // nothing actually done - every step skipped, or the run still starting - is never a green bar
  if (!anyDone) return "neutral";
  if (verdict === "pass") return "pass";
  if (verdict === "pass_with_notes") return "warn";
  return "neutral"; // fail, unknown, or not judged yet: the steps are settled, the result is not good news
}

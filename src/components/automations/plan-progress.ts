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

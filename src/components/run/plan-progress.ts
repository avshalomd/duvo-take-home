import type { Plan } from "@/contracts/run";

// "3 of 4 done, 1 skipped": how far a run got, in one line beside the thread. A skipped step is settled (the thread's
// fill passes it) but it is not done, so the two are counted apart (Q114).
export function planProgress(
  plan: Plan | null,
): { done: number; skipped: number; total: number; percent: number; label: string } | null {
  const total = plan?.steps.length ?? 0;
  if (!plan || total === 0) return null;

  const done = plan.steps.filter((s) => s.status === "done").length;
  const skipped = plan.steps.filter((s) => s.status === "skipped").length;
  const label = `${done} of ${total} done${skipped ? `, ${skipped} skipped` : ""}`;
  return { done, skipped, total, percent: Math.round(((done + skipped) / total) * 100), label };
}

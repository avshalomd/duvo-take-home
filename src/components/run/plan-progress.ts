import type { Plan } from "@/contracts/run";
import type { PlanThreadStep } from "./thread-steps";

// "3 of 4 done, 1 skipped": how far a run got, in one line beside the thread. A skipped step is settled (the thread's
// fill passes it) but it is not done, so the two are counted apart (Q114). The count is over the steps the thread
// draws - the plan's, then each attempt to fix the result - so the line and the nodes under it always agree.
export function planProgress(
  plan: Plan | null,
  steps: Pick<PlanThreadStep, "status">[],
): { done: number; skipped: number; total: number; percent: number; label: string } | null {
  // no plan, no count: before the plan exists the thread's one step is the agent reading the brief
  const total = plan && plan.steps.length > 0 ? steps.length : 0;
  if (total === 0) return null;

  const done = steps.filter((s) => s.status === "done").length;
  const skipped = steps.filter((s) => s.status === "skipped").length;
  const label = `${done} of ${total} done${skipped ? `, ${skipped} skipped` : ""}`;
  return { done, skipped, total, percent: Math.round(((done + skipped) / total) * 100), label };
}

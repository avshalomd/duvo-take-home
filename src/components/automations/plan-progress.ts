import type { Plan } from "@/contracts/run";

// "3 of 5 steps" over a thin bar: the one number that says how far a run got.
export function planProgress(
  plan: Plan | null,
): { done: number; total: number; percent: number; label: string } | null {
  throw new Error("not implemented");
}

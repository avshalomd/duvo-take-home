import type { Plan } from "@/contracts/run";

/** The step indexes that turned "done" between two plans: each one gets a per-step check. */
export function newlyDone(before: Plan | null, after: Plan): number[] {
  throw new Error(`not implemented: newlyDone(${before ? "plan" : "null"}, ${after.steps.length} steps)`);
}

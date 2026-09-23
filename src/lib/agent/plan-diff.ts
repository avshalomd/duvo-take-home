import type { Plan } from "@/contracts/run";

/** The step indexes that turned "done" between two plans: each one gets a per-step check. */
export function newlyDone(before: Plan | null, after: Plan): number[] {
  return after.steps
    .filter((s) => s.status === "done" && before?.steps.find((b) => b.index === s.index)?.status !== "done")
    .map((s) => s.index);
}

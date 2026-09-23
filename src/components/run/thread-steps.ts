import type { Plan, RunState } from "@/contracts/run";

export type PlanThreadStep = { key: number; title: string; status: "pending" | "running" | "done" | "skipped"; note?: string; flag?: string };

export function threadSteps(plan: Plan, runStatus: string, stepChecks: RunState["stepChecks"]): PlanThreadStep[] {
  void plan; void runStatus; void stepChecks;
  return [];
}

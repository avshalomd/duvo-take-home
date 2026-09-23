import type { Usage, WorkspaceLimits } from "@/contracts/usage";

export function budgetBlockReason(_limits: Pick<WorkspaceLimits, "dailyBudgetUsd" | "dailyRunLimit" | "maxInFlight">, _usage: Usage): string | null {
  throw new Error("not implemented yet");
}
export function startOfUtcDay(_now: Date): Date {
  throw new Error("not implemented yet");
}
export function nextUtcMidnight(_now: Date): Date {
  throw new Error("not implemented yet");
}

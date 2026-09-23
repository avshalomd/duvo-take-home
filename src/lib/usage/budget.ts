import "server-only";
import type { CheckBudget, GetLimits, GetUsage, UpdateLimits, WorkspaceLimits } from "@/contracts/usage";

export const DEFAULT_LIMITS: WorkspaceLimits = {
  dailyBudgetUsd: 5,
  dailyRunLimit: 30,
  maxInFlight: 3,
  stepChecks: true,
  strictConnections: false,
  deniedDomains: [],
};

export const getLimits: GetLimits = async () => DEFAULT_LIMITS; // STUB: reads workspace_settings, creating the row
export const updateLimits: UpdateLimits = async () => {
  throw new Error("not implemented: updateLimits"); // STUB
};
export const getUsage: GetUsage = async () => ({ runsToday: 0, costTodayUsd: 0, inFlight: 0, resetsAt: new Date().toISOString() }); // STUB
export const checkBudget: CheckBudget = async () => null; // STUB: runs today, cost today and in-flight against the limits

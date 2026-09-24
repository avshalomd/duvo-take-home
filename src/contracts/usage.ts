import { z } from "zod";

// Per-workspace limits (Settings > Limits). The rate limit by address from v1 stays as the outer brake.
export const WorkspaceLimits = z.object({
  // whole cents (F17): a fraction of one was saved and then read back as "$0.00"; *100 is checked with a float's slack
  dailyBudgetUsd: z.coerce.number().min(0).max(1000).refine((usd) => Math.abs(usd * 100 - Math.round(usd * 100)) < 1e-6, "Give the budget in whole cents"),
  dailyRunLimit: z.coerce.number().int().min(1).max(1000),
  maxInFlight: z.coerce.number().int().min(1).max(10),
  stepChecks: z.boolean(),
  strictConnections: z.boolean(),
  deniedDomains: z.array(z.string().trim().toLowerCase().min(3)).max(100),
  // Auto-heal (his call, 2026-09-23): when the evaluator fails a run, the agent gets the verdict and fixes its own
  // result, at most this many times. 0 turns it off.
  autoHealAttempts: z.coerce.number().int().min(0).max(5),
});
export type WorkspaceLimits = z.infer<typeof WorkspaceLimits>;

export const Usage = z.object({
  runsToday: z.number().int(),
  costTodayUsd: z.number(),
  inFlight: z.number().int(),
  resetsAt: z.string(), // the next UTC midnight
});
export type Usage = z.infer<typeof Usage>;

export type GetLimits = (workspaceId: string) => Promise<WorkspaceLimits>;
export type UpdateLimits = (workspaceId: string, limits: WorkspaceLimits) => Promise<void>;
export type GetUsage = (workspaceId: string) => Promise<Usage>;
/** null when a run may start; otherwise the reason in plain words, with when it resets. */
export type CheckBudget = (workspaceId: string) => Promise<string | null>;

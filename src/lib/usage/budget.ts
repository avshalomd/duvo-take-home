import "server-only";
import { and, count, eq, gte, inArray, sum } from "drizzle-orm";
import { db } from "@/db";
import { runs, workspaceSettings } from "@/db/schema";
import { WorkspaceLimits, type CheckBudget, type GetLimits, type GetUsage, type UpdateLimits } from "@/contracts/usage";
import { budgetBlockReason, nextUtcMidnight, startOfUtcDay } from "./budget-rule";

export const DEFAULT_LIMITS: WorkspaceLimits = {
  dailyBudgetUsd: 5,
  dailyRunLimit: 30,
  maxInFlight: 3,
  stepChecks: true,
  strictConnections: false,
  deniedDomains: [],
};

const IN_FLIGHT = ["queued", "running", "evaluating"]; // a run holds a slot from the moment it is created until its verdict

type Row = typeof workspaceSettings.$inferSelect;
const toLimits = (row: Row): WorkspaceLimits => ({
  dailyBudgetUsd: row.dailyBudgetUsd,
  dailyRunLimit: row.dailyRunLimit,
  maxInFlight: row.maxInFlight,
  stepChecks: row.stepChecks,
  strictConnections: row.strictConnections,
  deniedDomains: row.deniedDomains ?? [],
});

/** The workspace's limits. The first read stores the defaults, so the row the Limits page edits always exists. */
export const getLimits: GetLimits = async (workspaceId) => {
  const [row] = await db.select().from(workspaceSettings).where(eq(workspaceSettings.workspaceId, workspaceId));
  if (row) return toLimits(row);
  await db.insert(workspaceSettings).values({ workspaceId, ...DEFAULT_LIMITS }).onConflictDoNothing(); // two first reads at once: the second insert is a no-op
  return { ...DEFAULT_LIMITS, deniedDomains: [] }; // a copy: a caller changing it must not change the defaults
};

export const updateLimits: UpdateLimits = async (workspaceId, input) => {
  const limits = WorkspaceLimits.parse(input); // the action validated the form; this guards every other caller
  const values = { ...limits, updatedAt: new Date() };
  await db
    .insert(workspaceSettings)
    .values({ workspaceId, ...values })
    .onConflictDoUpdate({ target: workspaceSettings.workspaceId, set: values });
};

/** Today's usage, computed from the runs rather than stored, so it can never drift from what actually ran. */
export const getUsage: GetUsage = async (workspaceId) => {
  const now = new Date();
  const [[today], [live]] = await Promise.all([
    db
      .select({ runs: count(), cost: sum(runs.costUsd) })
      .from(runs)
      .where(and(eq(runs.workspaceId, workspaceId), gte(runs.createdAt, startOfUtcDay(now)))),
    db
      .select({ runs: count() })
      .from(runs)
      .where(and(eq(runs.workspaceId, workspaceId), inArray(runs.status, IN_FLIGHT))), // any day: a run started before midnight still holds its slot
  ]);
  return {
    runsToday: today.runs,
    costTodayUsd: Number(today.cost ?? 0), // Postgres sums a real column into a numeric, which arrives as a string (or null for no rows)
    inFlight: live.runs,
    resetsAt: nextUtcMidnight(now).toISOString(),
  };
};

/** null when a run may start; otherwise the reason in plain words, with when it resets. */
export const checkBudget: CheckBudget = async (workspaceId) => {
  const [limits, usage] = await Promise.all([getLimits(workspaceId), getUsage(workspaceId)]);
  return budgetBlockReason(limits, usage);
};

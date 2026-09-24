import { and, gte, notInArray, sum } from "drizzle-orm";
import { AgentLimits } from "@/contracts/agent";
import type { Tx } from "@/db";
import { runs } from "@/db/schema";
import { startOfUtcDay } from "./budget-rule";
import { modelSpendToday } from "./spend-today";

/**
 * The deployment's money for a day (security review S1, his call 2026-09-24). Each workspace has a budget of its own,
 * but every run spends the operator's one model key, and anyone invited can own several workspaces: so the whole
 * deployment stops starting runs once a day's spend, across every workspace, reaches this. Separate from the
 * workspace's budget (budget.ts) on purpose, so the two can change apart.
 */
export const DEFAULT_DEPLOYMENT_DAILY_BUDGET_USD = 50;
export const DEPLOYMENT_SPENT = "Handover has reached today's spending limit. Try again tomorrow.";

const IN_FLIGHT = ["queued", "running", "evaluating"];

/** DEPLOYMENT_DAILY_BUDGET_USD, or $50 when it is unset or not an amount: a typo must never lift the cap. */
export function deploymentDailyBudget(value: string | undefined = process.env.DEPLOYMENT_DAILY_BUDGET_USD): number {
  const usd = Number(value);
  return value !== undefined && value.trim() !== "" && Number.isFinite(usd) && usd >= 0 ? usd : DEFAULT_DEPLOYMENT_DAILY_BUDGET_USD;
}

/**
 * null when a run may start; otherwise the refusal. A run in flight has not recorded its cost yet, so it is reserved at
 * the most it may spend (AgentLimits.maxBudgetUsd): starts that arrive together cannot all fit under the budget.
 */
export function deploymentBudgetReason(day: { spentTodayUsd: number; inFlight: number; budgetUsd: number }): string | null {
  return day.spentTodayUsd + day.inFlight * AgentLimits.maxBudgetUsd >= day.budgetUsd ? DEPLOYMENT_SPENT : null;
}

/**
 * What today's finished runs of every workspace cost, and today's checks and drafts (QA F18), read inside the start's
 * transaction (lib/runs/start.ts).
 */
export async function deploymentSpentToday(tx: Tx, now: Date): Promise<number> {
  // one after the other: a transaction is one connection, which runs one statement at a time anyway
  const [today] = await tx
    .select({ usd: sum(runs.costUsd) })
    .from(runs)
    .where(and(gte(runs.createdAt, startOfUtcDay(now)), notInArray(runs.status, IN_FLIGHT))); // runs in flight are reserved instead
  const checks = await modelSpendToday(tx, null, now);
  return Number(today.usd ?? 0) + checks; // Postgres sums a real into a numeric, which arrives as a string (or null for no rows)
}

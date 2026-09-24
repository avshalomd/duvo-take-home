import { AgentLimits } from "@/contracts/agent";
import type { Usage, WorkspaceLimits } from "@/contracts/usage";

type DayLimits = Pick<WorkspaceLimits, "dailyBudgetUsd" | "dailyRunLimit" | "maxInFlight">;

/**
 * May a run start? null when it may; otherwise the reason in plain words. Pure, so every limit is unit-tested; the
 * database reads live in budget.ts. The day's limits are checked before the runs in progress, because when the day
 * is spent, waiting for a run to finish would not help.
 */
export function budgetBlockReason(limits: DayLimits, usage: Usage): string | null {
  const after = `More can start after ${utcClock(usage.resetsAt)} UTC.`;
  const budget = usd(limits.dailyBudgetUsd);
  if (usage.runsToday >= limits.dailyRunLimit)
    return `This workspace has used its ${plural(limits.dailyRunLimit, "run")} for today. ${after}`;
  // >=: a budget of $0 means no spending at all, and a run costs something the moment it starts
  if (usage.costTodayUsd >= limits.dailyBudgetUsd) return `This workspace has spent its ${budget} budget for today. ${after}`;
  if (usage.inFlight >= limits.maxInFlight)
    return usage.inFlight === 1
      ? "1 run is already working. Wait for it to finish."
      : `${usage.inFlight} runs are already working. Wait for one to finish.`;
  // The day's limit is never passed (the owner's call, engine review #7): a run's cost is known only once an attempt
  // finishes, so the new run and every run in flight hold back the most one attempt may cost.
  if (over(usage.costTodayUsd + ATTEMPT_MAX_USD, limits.dailyBudgetUsd))
    return `This workspace has ${usd(limits.dailyBudgetUsd - usage.costTodayUsd)} left of its ${budget} budget for today, and a run may cost up to ${usd(ATTEMPT_MAX_USD)}. ${after}`;
  if (over(usage.costTodayUsd + (usage.inFlight + 1) * ATTEMPT_MAX_USD, limits.dailyBudgetUsd))
    return usage.inFlight === 1
      ? `The run already working may use the rest of today's ${budget} budget. Wait for it to finish.`
      : `The runs already working may use the rest of today's ${budget} budget. Wait for one to finish.`;
  return null;
}

/**
 * May a run pay for another fix attempt today? null when it may; otherwise why healing stopped, in plain words. The
 * day's money counts, with the fix's own worst case and one attempt's for every other run in flight held back (engine
 * review #7); the run already holds its slot and is counted once among the day's runs.
 */
export function healBudgetReason(limits: Pick<WorkspaceLimits, "dailyBudgetUsd">, spentTodayUsd: number, othersInFlight: number): string | null {
  const budget = usd(limits.dailyBudgetUsd);
  if (spentTodayUsd >= limits.dailyBudgetUsd) return `The workspace's ${budget} budget for today is spent, so healing stopped here.`;
  if (over(spentTodayUsd + ATTEMPT_MAX_USD, limits.dailyBudgetUsd))
    return `The workspace has ${usd(limits.dailyBudgetUsd - spentTodayUsd)} left of its ${budget} budget for today, less than a fix may cost (${usd(ATTEMPT_MAX_USD)}), so healing stopped here.`;
  if (over(spentTodayUsd + (othersInFlight + 1) * ATTEMPT_MAX_USD, limits.dailyBudgetUsd))
    return `The other runs working may use the rest of today's ${budget} budget, so healing stopped here.`;
  return null;
}

const ATTEMPT_MAX_USD = AgentLimits.maxBudgetUsd; // the SDK ends an attempt at this; a run is one attempt, a fix another
const over = (usd: number, budget: number) => usd > budget + 1e-9; // reaching the budget exactly is within it; floats add up unevenly
const usd = (n: number) => `$${n.toFixed(2)}`;

// Usage is counted per UTC day, so every workspace resets at the same instant whatever the viewer's time zone.
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function nextUtcMidnight(now: Date): Date {
  const start = startOfUtcDay(now);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 1)); // Date.UTC rolls a day 31 over into the next month
}

const utcClock = (iso: string) => new Date(iso).toISOString().slice(11, 16); // "2026-09-24T00:00:00.000Z" -> "00:00"
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

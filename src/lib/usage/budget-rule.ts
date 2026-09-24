import type { Usage, WorkspaceLimits } from "@/contracts/usage";

type DayLimits = Pick<WorkspaceLimits, "dailyBudgetUsd" | "dailyRunLimit" | "maxInFlight">;

/**
 * May a run start? null when it may; otherwise the reason in plain words. Pure, so every limit is unit-tested; the
 * database reads live in budget.ts. The day's limits are checked before the runs in progress, because when the day
 * is spent, waiting for a run to finish would not help.
 */
export function budgetBlockReason(limits: DayLimits, usage: Usage): string | null {
  const after = `More can start after ${utcClock(usage.resetsAt)} UTC.`;
  if (usage.runsToday >= limits.dailyRunLimit)
    return `This workspace has used its ${plural(limits.dailyRunLimit, "run")} for today. ${after}`;
  // >=: a budget of $0 means no spending at all, and a run costs something the moment it starts
  if (usage.costTodayUsd >= limits.dailyBudgetUsd)
    return `This workspace has spent its $${dollars(limits.dailyBudgetUsd)} budget for today. ${after}`;
  if (usage.inFlight >= limits.maxInFlight)
    return usage.inFlight === 1
      ? "1 run is already working. Wait for it to finish."
      : `${usage.inFlight} runs are already working. Wait for one to finish.`;
  return null;
}

/**
 * May a run pay for another fix attempt today? null when it may; otherwise why healing stopped, in plain words. Only
 * the day's money counts: the run already holds its slot and is counted once among the day's runs.
 */
export function healBudgetReason(limits: Pick<WorkspaceLimits, "dailyBudgetUsd">, spentTodayUsd: number): string | null {
  if (spentTodayUsd < limits.dailyBudgetUsd) return null;
  return `The workspace's $${dollars(limits.dailyBudgetUsd)} budget for today is spent, so healing stopped here.`;
}

/**
 * A budget as it was set (F17): whole cents with two decimals ($2.50; a real column reads 0.07 back as 0.0700000003),
 * and a fraction of a cent saved before the form took whole cents only as it is ($0.001), never rounded to "$0.00".
 */
function dollars(usd: number): string {
  const cents = Math.round(usd * 100);
  return Math.abs(usd * 100 - cents) < 1e-6 ? (cents / 100).toFixed(2) : String(usd);
}

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

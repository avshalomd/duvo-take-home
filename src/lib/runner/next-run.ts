import { CronExpressionParser } from "cron-parser";

/** The first time the cron expression fires strictly after `after`, in UTC; null when the expression is invalid. */
export function nextRunAfter(cron: string, after: Date): Date | null {
  if (!cron.trim()) return null;
  try {
    // UTC always: the server's own zone differs between this laptop, the worker and Vercel
    return CronExpressionParser.parse(cron, { currentDate: after, tz: "UTC" }).next().toDate();
  } catch {
    return null; // a bad expression must not throw inside the tick and stop the other automations
  }
}

export type ScheduleAction =
  | { fire: false; next: Date | null } // not due yet, or seen for the first time: only next_run_at may move
  | { fire: true; next: Date | null };

/** What one tick does with one automation's schedule. */
export function scheduleAction(a: { schedule: string; nextRunAt: Date | null }, now: Date): ScheduleAction {
  const next = nextRunAfter(a.schedule, now);
  if (!next) return { fire: false, next: null }; // invalid: never fire what cannot be read
  // First sight (just saved, or the schedule changed): compute the slot, do not fire - a new schedule waits for its time.
  if (!a.nextRunAt) return { fire: false, next };
  if (a.nextRunAt.getTime() > now.getTime()) return { fire: false, next: a.nextRunAt };
  // Due. The next slot is counted from now, not from the missed one, so a worker that was down fires once, not per slot.
  return { fire: true, next };
}

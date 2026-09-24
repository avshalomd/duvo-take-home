import { CronExpressionParser } from "cron-parser";

/**
 * The first time the cron expression fires strictly after `after`, as an instant; null when the expression or the
 * zone is invalid. The expression is read in `tz`, the IANA zone the schedule was set in (automations.schedule_tz),
 * so "weekdays 08:00" stays 08:00 for the person across daylight saving; a schedule saved before zones existed has
 * none and is read in UTC, as it always was. Never the server's own zone: it differs between this laptop, the worker
 * and Vercel.
 */
export function nextRunAfter(cron: string, after: Date, tz?: string | null): Date | null {
  if (!cron.trim()) return null;
  try {
    return CronExpressionParser.parse(cron, { currentDate: after, tz: tz || "UTC" }).next().toDate();
  } catch {
    return null; // a bad expression or an unknown zone must not throw inside the tick and stop the other automations
  }
}

export type ScheduleAction =
  | { fire: false; next: Date | null; missed?: Date } // not due yet, first sight, or `missed`: a slot too late to run
  | { fire: true; next: Date | null };

// A slot later than this is skipped, not run late (the owner's call, engine review #5): a digest meant for 08:00 is no
// use in the afternoon, and a paid run the person did not expect then is worse than none.
export const LATE_SLOT_MS = 60 * 60_000;

/** What one tick does with one automation's schedule. */
export function scheduleAction(a: { schedule: string; nextRunAt: Date | null; tz?: string | null }, now: Date): ScheduleAction {
  const next = nextRunAfter(a.schedule, now, a.tz);
  if (!next) return { fire: false, next: null }; // invalid: never fire what cannot be read
  // First sight (just saved, or the schedule changed): compute the slot, do not fire - a new schedule waits for its time.
  if (!a.nextRunAt) return { fire: false, next };
  if (a.nextRunAt.getTime() > now.getTime()) return { fire: false, next: a.nextRunAt };
  // Due. The next slot is counted from now, not from the missed one, so a worker that was down never fires per slot.
  if (now.getTime() - a.nextRunAt.getTime() > LATE_SLOT_MS) return { fire: false, next, missed: a.nextRunAt };
  return { fire: true, next };
}

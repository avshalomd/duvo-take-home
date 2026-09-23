/** The first time the cron expression fires strictly after `after`, in UTC; null when the expression is invalid. */
export function nextRunAfter(cron: string, after: Date): Date | null {
  throw new Error(`not implemented: nextRunAfter(${cron}, ${after.toISOString()})`);
}

export type ScheduleAction =
  | { fire: false; next: Date | null } // not due yet, or seen for the first time: only next_run_at may move
  | { fire: true; next: Date | null };

/** What one tick does with one automation's schedule. */
export function scheduleAction(a: { schedule: string; nextRunAt: Date | null }, now: Date): ScheduleAction {
  throw new Error(`not implemented: scheduleAction(${a.schedule}, ${now.toISOString()})`);
}

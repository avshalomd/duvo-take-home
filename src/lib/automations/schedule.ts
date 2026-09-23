import { CronExpressionParser } from "cron-parser";
import { AutomationError } from "./errors";
import { SCHEDULE_PRESETS } from "./schedule-presets";

// Schedules are read in UTC: the server's clock on Vercel is UTC, and a fixed zone keeps next_run_at the same whoever
// computes it (this page or the engine's tick). The labels say "(UTC)" so nobody expects local time.
const TZ = "UTC";
const MIN_GAP_MS = 60 * 60_000; // at most once an hour: every run is an agent run that costs money

export { SCHEDULE_PRESETS };

/** The first time the schedule fires after `from`. Refuses an expression that does not parse or fires too often. */
export function nextRunAt(cron: string, from: Date): Date {
  let upcoming: Date[];
  try {
    upcoming = CronExpressionParser.parse(cron.trim(), { currentDate: from, tz: TZ })
      .take(5)
      .map((d) => d.toDate());
  } catch {
    throw new AutomationError("That schedule is not a valid cron expression (minute hour day month weekday, e.g. 0 8 * * 1-5).");
  }
  // five upcoming times are enough to catch "every 5 minutes" and "8:00 and 8:05" alike
  const tooClose = upcoming.some((d, i) => i > 0 && d.getTime() - upcoming[i - 1].getTime() < MIN_GAP_MS);
  if (tooClose) throw new AutomationError("A schedule can run at most once an hour.");
  return upcoming[0];
}

/** The schedule in words for the page: a preset's label, or the expression itself. */
export function describeSchedule(cron: string): string {
  const preset = SCHEDULE_PRESETS.find((p) => p.cron === cron.trim());
  return preset ? `${preset.label} (UTC)` : `Custom: ${cron.trim()} (UTC)`;
}

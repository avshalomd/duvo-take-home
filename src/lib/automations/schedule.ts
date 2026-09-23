import { CronExpressionParser } from "cron-parser";
import { AutomationError } from "./errors";

// Schedules are stored and read in UTC: the server's clock on Vercel is UTC, and a fixed zone keeps next_run_at the
// same whoever computes it (this page or the engine's tick). The page shows them in the viewer's time (schedule-local.ts).
const TZ = "UTC";
const MIN_GAP_MS = 60 * 60_000; // at most once an hour: every run is an agent run that costs money

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

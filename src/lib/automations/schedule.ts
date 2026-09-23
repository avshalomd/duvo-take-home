import { CronExpressionParser } from "cron-parser";
import { AutomationError } from "./errors";

const MIN_GAP_MS = 60 * 60_000; // at most once an hour: every run is an agent run that costs money

/** Whether this is an IANA zone the runtime knows ("Europe/Prague"); the zone arrives from the browser, so it is checked. */
export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false; // RangeError: an unknown zone
  }
}

/**
 * The first time the schedule fires after `from`, reading the cron in the schedule's own zone (schedule_tz), so
 * 08:00 in Prague is 08:00 there in summer and in winter. A schedule saved before zones were stored has none: its
 * cron was written in UTC, so it is read in UTC. Refuses a zone or an expression that does not parse, and one
 * that fires too often.
 */
export function nextRunAt(cron: string, from: Date, tz?: string | null): Date {
  const zone = tz || "UTC";
  if (!isTimeZone(zone)) throw new AutomationError(`That time zone is not one we know (${zone}).`);
  let upcoming: Date[];
  try {
    upcoming = CronExpressionParser.parse(cron.trim(), { currentDate: from, tz: zone })
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

import { dayKey, dayLabel } from "./rail";

const DAY_MS = 86_400_000;

// "2 min ago" is how a list of runs is read. Past today it counts calendar days in the reader's time zone, exactly
// as the rail groups runs, so a run under "Yesterday" in the rail says "Yesterday" on its page too (UX QA U19).
export function relativeTime(iso: string, now: Date = new Date(), timeZone?: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return ""; // a date we cannot read is shown as nothing, never as "NaN min ago"

  const today = dayKey(now, timeZone);
  const day = dayKey(then, timeZone);
  const days = Math.round((Date.parse(today) - Date.parse(day)) / DAY_MS); // both keys parse as UTC midnights
  if (days <= 0) {
    // max 0: a server clock ahead of the browser must not read as the future
    const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return dayLabel(day, today); // "16 Sep", as the rail's heading for that day
}

/**
 * The moment itself, for a tooltip: "Wednesday 23 September, 14:14" in the reader's zone, the year only when it is not
 * this one (UX QA U8: the tooltip was the stored ISO string). Built from parts in a fixed order, so it reads the same
 * whatever the browser's locale data.
 */
export function fullDate(iso: string, timeZone?: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const thisYear = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric" }).format(now);
  const year = parts.year === thisYear ? "" : ` ${parts.year}`;
  return `${parts.weekday} ${parts.day} ${parts.month}${year}, ${parts.hour}:${parts.minute}`;
}

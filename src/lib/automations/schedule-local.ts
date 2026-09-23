// Schedules in the viewer's own time (Q107). The scheduler reads a cron in UTC, so the page converts: a local choice
// ("every weekday at 08:00") becomes a UTC cron when it is saved, and a stored cron is read back into the viewer's
// time when it is shown. No imports: the schedule form is a client component and calls these too.
//
// offsetMinutes is Date#getTimezoneOffset(): the minutes to ADD to local time to get UTC (Prague in summer: -120).
// It is the offset on the day the schedule is saved; a summer schedule runs an hour off local time in winter until
// the zone itself is stored (see the report's contract request).

export type ScheduleChoice = { repeat: "weekdays" | "mondays" | "daily"; time: string }; // time "HH:MM", 24-hour

const DAY = 24 * 60;
const LOCAL_DAYS: Record<Exclude<ScheduleChoice["repeat"], "daily">, number[]> = { weekdays: [1, 2, 3, 4, 5], mondays: [1] };
const pad = (n: number) => String(n).padStart(2, "0");

/** A local choice as the UTC cron the scheduler reads: the time moves by the offset, the days move when it crosses midnight. */
export function toUtcCron(choice: ScheduleChoice, offsetMinutes: number): string {
  const [h, m] = choice.time.split(":").map(Number);
  const utc = h * 60 + m + offsetMinutes;
  const shift = Math.floor(utc / DAY); // -1, 0 or +1: the UTC day relative to the local one
  const minutes = ((utc % DAY) + DAY) % DAY;
  const days = choice.repeat === "daily" ? "*" : formatDays(LOCAL_DAYS[choice.repeat].map((d) => (d + shift + 7) % 7));
  return `${minutes % 60} ${Math.floor(minutes / 60)} * * ${days}`;
}

/** A stored UTC cron as the local choice it came from, or null when it is not one this form writes (shown as custom). */
export function fromUtcCron(cron: string, offsetMinutes: number): ScheduleChoice | null {
  const m = /^(\d{1,2}) (\d{1,2}) \* \* (\*|[0-6](?:-[0-6])?)$/.exec(cron.trim());
  if (!m) return null;
  const local = Number(m[2]) * 60 + Number(m[1]) - offsetMinutes;
  const shift = Math.floor(local / DAY); // the local day relative to the UTC one
  const minutes = ((local % DAY) + DAY) % DAY;
  const time = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  if (m[3] === "*") return { repeat: "daily", time };
  const days = parseDays(m[3]).map((d) => (d + shift + 7) % 7);
  for (const repeat of ["weekdays", "mondays"] as const) if (formatDays(days) === formatDays(LOCAL_DAYS[repeat])) return { repeat, time };
  return null;
}

/** The choice in words, in the viewer's time. */
export function describeChoice(choice: ScheduleChoice): string {
  const when = { weekdays: "Every weekday", mondays: "Every Monday", daily: "Every day" }[choice.repeat];
  return `${when} at ${choice.time}`;
}

// Days as cron writes them: one day, or a run of consecutive days as a range ("1-5"); the shifted weekdays stay a run.
function formatDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (sorted.length > 1 && consecutive) return `${sorted[0]}-${sorted[sorted.length - 1]}`;
  return sorted.join(",");
}

function parseDays(field: string): number[] {
  const [from, to] = field.split("-").map(Number);
  if (to === undefined) return [from];
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

export const choiceToCron = (_choice: ScheduleChoice): string => ""; // STUB
export const cronToChoice = (_cron: string): ScheduleChoice | null => null; // STUB
export const zoneName = (_tz: string): string => ""; // STUB

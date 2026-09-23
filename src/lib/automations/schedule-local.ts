// Schedules in the viewer's own time (Q107). The cron is kept in the zone it was chosen in - stored beside it as
// schedule_tz, an IANA name such as "Europe/Prague" - so "08:00" is written as 08:00 and stays 08:00 when the clocks
// change; the scheduler reads the cron in that zone. No imports: the schedule form is a client component too.

export type ScheduleChoice = { repeat: "weekdays" | "mondays" | "daily"; time: string }; // time "HH:MM", 24-hour

const DAYS: Record<ScheduleChoice["repeat"], string> = { weekdays: "1-5", mondays: "1", daily: "*" };
const pad = (n: number) => String(n).padStart(2, "0");

/** A choice from the form as the cron that says it, in the same local time. */
export function choiceToCron(choice: ScheduleChoice): string {
  const [h, m] = choice.time.split(":").map(Number);
  return `${m} ${h} * * ${DAYS[choice.repeat]}`;
}

/** A stored cron as the choice it came from, or null when it is not one this form writes (shown as custom). */
export function cronToChoice(cron: string): ScheduleChoice | null {
  const m = /^(\d{1,2}) (\d{1,2}) \* \* (\S+)$/.exec(cron.trim());
  if (!m) return null;
  const repeat = (Object.keys(DAYS) as ScheduleChoice["repeat"][]).find((r) => DAYS[r] === m[3]);
  const [minute, hour] = [Number(m[1]), Number(m[2])];
  if (!repeat || minute > 59 || hour > 23) return null;
  return { repeat, time: `${pad(hour)}:${pad(minute)}` };
}

/** The choice in words. */
export function describeChoice(choice: ScheduleChoice): string {
  const when = { weekdays: "Every weekday", mondays: "Every Monday", daily: "Every day" }[choice.repeat];
  return `${when} at ${choice.time}`;
}

/** A zone as people say it: "Europe/Prague" is "Prague time"; UTC stays UTC. */
export function zoneName(tz: string): string {
  if (tz === "UTC") return "UTC";
  return `${(tz.split("/").pop() ?? tz).replace(/_/g, " ")} time`;
}

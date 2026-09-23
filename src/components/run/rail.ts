import type { Run } from "@/contracts/run";

// What the runs rail shows: the runs grouped by day, a search over the instructions, a short title and a quiet tag.
// Pure, so the grouping can be tested with a fixed clock and time zone.

export type DayGroup<T> = { label: string; runs: T[] };

const DAY_MS = 86_400_000;

/** "2026-09-23" for the calendar day the instant falls on in the given time zone. */
function dayKey(date: Date, timeZone?: string): string {
  // en-CA formats as YYYY-MM-DD, which sorts and parses; the time zone decides where midnight is
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function dayLabel(key: string, todayKey: string): string {
  const days = Math.round((Date.parse(todayKey) - Date.parse(key)) / DAY_MS); // both keys parse as UTC midnights
  if (days <= 0) return "Today"; // a clock a little ahead of ours still means today, not the future
  if (days === 1) return "Yesterday";
  const day = new Date(`${key}T12:00:00Z`); // noon UTC names the same calendar day in every time zone
  if (days < 7) return day.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  // built from parts: en-GB's short month is "Sept" in newer ICU data and "Sep" in older, and the label must not drift
  const month = day.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const sameYear = key.slice(0, 4) === todayKey.slice(0, 4);
  return `${day.getUTCDate()} ${month}${sameYear ? "" : ` ${key.slice(0, 4)}`}`;
}

/** Groups runs by the reader's calendar day, keeping their order (the list arrives newest first). */
export function groupByDay<T extends { createdAt: string }>(runs: T[], now: Date, timeZone?: string): DayGroup<T>[] {
  const todayKey = dayKey(now, timeZone);
  const groups: (DayGroup<T> & { key: string })[] = [];
  for (const run of runs) {
    const key = dayKey(new Date(run.createdAt), timeZone);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.runs.push(run);
    else groups.push({ key, label: dayLabel(key, todayKey), runs: [run] });
  }
  return groups.map(({ label, runs }) => ({ label, runs }));
}

/** Every word of the query must appear in the instructions, in any order and any case. */
export function matchesSearch(run: Pick<Run, "prompt">, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = run.prompt.toLowerCase();
  return words.every((w) => text.includes(w));
}

/** The first line of the instructions; for an automation's run, its input, since the command tag names the rest. */
export function runTitle(run: Pick<Run, "prompt" | "purpose" | "input">): string {
  const fromAutomation = run.purpose === "automation" || run.purpose === "schedule";
  if (fromAutomation && run.input?.trim()) return run.input.trim();
  return run.prompt.split("\n").map((l) => l.trim()).find(Boolean) ?? run.prompt;
}

/** Why the run exists, when it is not plain typed text. commands maps an automation's id to its command. */
export function runTag(run: Pick<Run, "purpose" | "automationId">, commands: Record<string, string>): string | null {
  const command = run.automationId ? commands[run.automationId] : undefined;
  switch (run.purpose) {
    case "automation":
      return command ? `/${command}` : "automation"; // the automation may have been deleted since
    case "schedule":
      return command ? `/${command}, scheduled` : "scheduled";
    case "trial":
      return "example";
    case "followup":
      return "follow-up";
    default:
      return null;
  }
}

import type { Run } from "@/contracts/run";

// What the runs rail shows: the runs grouped by day, a search over the instructions, a short title and a quiet tag.
// Pure, so the grouping can be tested with a fixed clock and time zone.

export type DayGroup<T> = { label: string; runs: T[] };

const DAY_MS = 86_400_000;

/** "2026-09-23" for the calendar day the instant falls on in the given time zone. */
export function dayKey(date: Date, timeZone?: string): string {
  // en-CA formats as YYYY-MM-DD, which sorts and parses; the time zone decides where midnight is
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** The rail's heading for a day: Today, Yesterday, a weekday in the last week, then the date. */
export function dayLabel(key: string, todayKey: string): string {
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

/**
 * Every word of the query must appear in the run's text, in any order and any case. The text is the instructions,
 * the title, the tag and the command of the run's automation, so an automation's run - called, scheduled or an
 * example, whose tag says "example" - is found by its command and name as well as by its input (Q133).
 */
export function matchesSearch(
  run: { prompt: string; title?: string; tag?: string | null; command?: string | null },
  query: string,
): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const command = run.command ? `/${run.command}` : ""; // with its slash, so "/audit" and "audit" both find it
  const text = [run.prompt, run.title ?? "", run.tag ?? "", command].join(" ").toLowerCase();
  return words.every((w) => text.includes(w));
}

const FROM_AUTOMATION = ["automation", "schedule", "trial"];

/**
 * A run's name. For a run of a saved automation - called, scheduled or an example - the instructions are the filled
 * template, which is nobody's name for it: "<automation name>: <input>" is (Q94, Q95). names maps an automation's id
 * to its name. A deleted automation leaves no name, and its input alone ("cherries 7, grapes 3") names nothing, so
 * such a run reads as a plain run, by the first line of its instructions (Q204).
 */
export function runTitle(run: Pick<Run, "prompt" | "purpose" | "input" | "automationId">, names: Record<string, string> = {}): string {
  const name = run.purpose && FROM_AUTOMATION.includes(run.purpose) && run.automationId ? names[run.automationId] : undefined;
  if (name) {
    const input = run.input?.trim();
    return input ? `${name}: ${input}` : name;
  }
  return run.prompt.split("\n").map((l) => l.trim()).find(Boolean) ?? run.prompt;
}

/**
 * Why the run exists, when its title does not say it. A called automation's run is titled by the automation, so a
 * tag with its command only repeated the name and squeezed the input out of the row; the command is still searched
 * (matchesSearch). A run whose automation was deleted reads as a plain run, with no tag either.
 */
export function runTag(run: Pick<Run, "purpose">): string | null {
  switch (run.purpose) {
    case "schedule":
      return "scheduled";
    case "trial":
      return "example";
    case "followup":
      return "follow-up";
    default:
      return null;
  }
}

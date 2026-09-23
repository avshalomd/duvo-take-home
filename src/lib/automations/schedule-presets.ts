// The schedule presets, alone in a file with no imports: the schedule form is a client component, and importing
// schedule.ts there would ship cron-parser and the server's error classes to the browser.
export const SCHEDULE_PRESETS = [
  { id: "weekdays", label: "Every weekday at 08:00", cron: "0 8 * * 1-5" },
  { id: "mondays", label: "Every Monday at 08:00", cron: "0 8 * * 1" },
] as const;

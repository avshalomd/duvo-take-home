export type ScheduleChoice = { repeat: "weekdays" | "mondays" | "daily"; time: string };
export const toUtcCron = (_choice: ScheduleChoice, _offsetMinutes: number): string => ""; // STUB
export const fromUtcCron = (_cron: string, _offsetMinutes: number): ScheduleChoice | null => null; // STUB
export const describeChoice = (_choice: ScheduleChoice): string => ""; // STUB

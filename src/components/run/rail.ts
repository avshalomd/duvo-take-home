import type { Run } from "@/contracts/run";

export type DayGroup<T> = { label: string; runs: T[] };

export function groupByDay<T extends { createdAt: string }>(runs: T[], now: Date, timeZone?: string): DayGroup<T>[] {
  void runs; void now; void timeZone;
  return [];
}

export function matchesSearch(run: Pick<Run, "prompt">, query: string): boolean {
  void run; void query;
  return false;
}

export function runTitle(run: Pick<Run, "prompt" | "purpose" | "input">): string {
  void run;
  return "";
}

export function runTag(run: Pick<Run, "purpose" | "automationId">, commands: Record<string, string>): string | null {
  void run; void commands;
  return null;
}

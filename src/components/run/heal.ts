import type { RunEvent, RunState } from "@/contracts/run";

export type Heal = NonNullable<RunState["heals"]>[number] & { stopped?: boolean };

export function healsOf(heals: RunState["heals"], events: RunEvent[], runStatus: string): Heal[] {
  void events; // written in the next commit
  void runStatus;
  return heals ?? [];
}

export function fixesRun(heals: Heal[]): number {
  return heals.length; // written in the next commit
}

export function ordinal(n: number): string {
  return String(n); // written in the next commit
}

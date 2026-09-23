import type { Run } from "@/contracts/run";

export function canMakeAutomation(run: Pick<Run, "status" | "purpose">, headline: string | null | undefined): boolean {
  void run; void headline;
  return true;
}

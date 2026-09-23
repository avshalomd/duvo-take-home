import type { Verdict } from "@/contracts/eval";
import type { Run } from "@/contracts/run";

export function changeSuggestion(verdict: Pick<Verdict, "verdict" | "reasons"> | null): string | null {
  void verdict; // written in the next commit
  return null;
}

// An automation repeats what a run did, so only a run whose result passed is worth saving as one (Q121) - and not a
// run that already came from an automation (an example, a called or a scheduled one).
const FROM_AUTOMATION = ["trial", "automation", "schedule"];

/** headline is the verdict's headline: the full verdict's when it parsed, else Run.outcome. */
export function canMakeAutomation(run: Pick<Run, "status" | "purpose">, headline: string | null | undefined): boolean {
  if (run.status !== "succeeded") return false;
  if (run.purpose && FROM_AUTOMATION.includes(run.purpose)) return false;
  return headline === "pass" || headline === "pass_with_notes";
}

import type { Verdict } from "@/contracts/eval";
import type { Run } from "@/contracts/run";
import { plainCheckReason } from "@/lib/eval/check-words";

/**
 * "Ask for a change" on a result that did not pass opens with a first draft: fix the first thing the check found. The
 * person edits it; the follow-up run is also given the whole verdict (the engine), so one reason is enough here.
 */
export function changeSuggestion(verdict: Pick<Verdict, "verdict" | "reasons"> | null): string | null {
  const first = verdict?.verdict === "fail" ? verdict.reasons[0] : undefined;
  // a failed check named by what failed, not by its pass label (qa-ux U10)
  return first ? `Please fix what did not pass: ${plainCheckReason(first) ?? first}` : null;
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

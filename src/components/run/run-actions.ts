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

/**
 * The example in the Ask for a change box, fitted to what the run made (UX QA U25): a chart, a table or a spreadsheet
 * each get a change a person might ask of one; a text file or no file gets the plain question, since no one example
 * fits a haiku and a memo alike. The most particular file wins: a run with a chart and its data is about the chart.
 */
export function changePlaceholder(files: string[]): string {
  const ext = new Set(files.map((name) => name.toLowerCase().split(".").pop()));
  const ask = "What should change?";
  if (ext.has("svg")) return `${ask} For example: make the bars horizontal`; // only the chart tool makes .svg files
  if (ext.has("csv")) return `${ask} For example: add a column with each source's country`;
  if (ext.has("xlsx")) return `${ask} For example: add a sheet with the totals`;
  return ask;
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

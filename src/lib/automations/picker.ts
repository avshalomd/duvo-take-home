import type { VerdictKind } from "@/contracts/eval";

type Outcome = VerdictKind | null;

// A run that did well is the best starting point, so it comes first; one nobody checked beats one that failed its check.
const RANK: Record<string, number> = { pass: 0, pass_with_notes: 0, unknown: 1, none: 1, fail: 2 };
const MARK: Record<string, string | null> = { pass: null, pass_with_notes: null, unknown: "Not checked", none: "Not checked", fail: "Did not pass its check" };

/** The runs for "New from a run": the ones that did well first, the rest marked in plain words (Q108). */
export function orderForPicker<T extends { outcome: Outcome }>(runs: T[]): (T & { mark: string | null })[] {
  const key = (r: T) => r.outcome ?? "none";
  // sort is stable, so the newest-first order the query gave is kept inside each group
  return [...runs].sort((a, b) => RANK[key(a)] - RANK[key(b)]).map((r) => ({ ...r, mark: MARK[key(r)] }));
}

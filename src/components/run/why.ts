import type { Check, Judgment, Review, Verdict } from "@/contracts/eval";

// "Why?" under the outcome: one plain line per tier of the evaluator that ran (checks -> judge -> review), in the
// order it ran, with the tier that decided the outcome marked. Words only: the probabilities stay in Details.

export type WhyTier = "checks" | "judge" | "review";
export type WhyLine = {
  tier: WhyTier | "none";
  tone: "ok" | "warn" | "bad" | "idle";
  decided: boolean;
  text: string;
};

// The evaluator's own bar (CONFIDENT in src/lib/eval/evaluate.ts): an answer at or past it either way is "sure".
const SURE = 0.8;
const MAX_QUOTE = 200;

/**
 * storedOutcome is Run.outcome: the headline of the stored verdict. It is there even when the full verdict is not -
 * a verdict stored by the first version of the app no longer parses - and then Why? must agree with it (Q91).
 */
export function whyLines(verdict: Verdict | null, runStatus: string, storedOutcome?: string | null): WhyLine[] {
  if (!verdict) return noVerdict(runStatus, storedOutcome ?? null);
  const path = verdict.path ?? inferPath(verdict);
  const decidedBy = verdict.decidedBy ?? inferDecidedBy(verdict);
  return path.flatMap((tier): WhyLine[] => {
    const line = tier === "checks" ? checksLine(verdict.checks) : tier === "judge" ? judgeLine(verdict.judgment) : reviewLine(verdict.review);
    const lines: WhyLine[] = [{ tier, decided: tier === decidedBy, ...line }];
    // the judge's third answer, asked in the same request: only worth a line when it is not a clear yes
    const bounds = tier === "judge" ? boundsLine(verdict.judgment) : null;
    if (bounds) lines.push({ tier, decided: false, ...bounds });
    return lines;
  });
}

const EARLIER_TONE: Record<string, WhyLine["tone"]> = { pass: "ok", pass_with_notes: "warn", fail: "bad", unknown: "idle" };

// Why? only appears when it adds something (Q102): a stopped or broken run already says so in its outcome line and
// banner, and a live one has not been checked yet, so for those there is nothing to open.
function noVerdict(runStatus: string, storedOutcome: string | null): WhyLine[] {
  if (runStatus !== "succeeded") return [];
  if (storedOutcome && EARLIER_TONE[storedOutcome])
    return [{ tier: "none", tone: EARLIER_TONE[storedOutcome], decided: true, text: "Checked by an earlier version of the app, which kept the result but not the reasons" }];
  return [{ tier: "none", tone: "idle", decided: false, text: "This run has not been checked" }];
}

// v1 verdicts carry no path: the tiers that ran are the ones that left something behind. Checks always run.
function inferPath(v: Verdict): WhyTier[] {
  const path: WhyTier[] = ["checks"];
  if (v.judgment) path.push("judge");
  if (v.review) path.push("review");
  return path;
}

function inferDecidedBy(v: Verdict): Verdict["decidedBy"] {
  if (v.verdict === "unknown") return "nobody";
  if (v.review) return "review";
  if (v.judgment) return "judge";
  return "checks";
}

type Body = Omit<WhyLine, "tier" | "decided">;

function checksLine(checks: Check[]): Body {
  if (checks.length === 0) return { tone: "idle", text: "No automatic checks applied to this run" };
  const failed = checks.filter((c) => !c.ok);
  const noun = checks.length === 1 ? "check" : "checks";
  if (failed.length === 0)
    return { tone: "ok", text: `${checks.length} ${noun} passed: ${checks.map((c) => lowerFirst(c.label)).join(", ")}` };
  const what = failed.map((c) => (c.detail ? `${lowerFirst(c.label)} (${c.detail})` : lowerFirst(c.label))).join("; ");
  return { tone: "bad", text: `${failed.length} of ${checks.length} ${noun} failed: ${what}` };
}

// Each of the judge's answers is a clause; "sure" clauses and "not sure" clauses are then joined into one sentence.
function judgeLine(judgment: Judgment | null): Body {
  if (!judgment)
    return { tone: "idle", text: "The judge could not be reached, so nobody checked whether the result answers your instructions" };
  const answers = [
    { p: judgment.answeredQuery, yes: "the result answers your instructions", no: "the result does not answer your instructions" },
    { p: judgment.followedPlan, yes: "the plan was finished", no: "the plan was not finished" },
  ];
  const sure = answers.filter((a) => a.p >= SURE || a.p <= 1 - SURE).map((a) => (a.p >= SURE ? a.yes : a.no));
  const unsure = answers.filter((a) => a.p < SURE && a.p > 1 - SURE).map((a) => a.yes);
  const anyNo = answers.some((a) => a.p <= 1 - SURE);
  const tone = anyNo ? "bad" : unsure.length ? "warn" : "ok";

  if (unsure.length === 0) return { tone, text: `The judge was sure ${sure.join(" and that ")}` };
  if (sure.length === 0) return { tone, text: `The judge was not sure ${unsure.join(", nor that ")}` };
  return { tone, text: `The judge was sure ${sure[0]} but not that ${unsure[0]}` };
}

// stayedInBounds: P(the run acted only on the person's instructions, not on text it read). Absent on older verdicts.
function boundsLine(judgment: Judgment | null): Body | null {
  const p = judgment?.stayedInBounds;
  if (p === undefined || p >= SURE) return null;
  if (p <= 1 - SURE) return { tone: "bad", text: "The run followed instructions it found on a page, not only yours" };
  return { tone: "warn", text: "The run may have followed instructions it found on a page, not only yours" };
}

function reviewLine(review: Review | null): Body {
  if (!review) return { tone: "idle", text: "A reviewer was asked for a second reading but could not be reached" };
  const finding = !review.taskFinished ? "not finished" : review.responseSuitable ? "finished and usable" : "finished, but not usable as it is";
  const tone = review.taskFinished && review.responseSuitable ? "ok" : "bad";
  return { tone, text: `A reviewer read the whole run: ${finding}. "${shorten(review.reasoning)}"` };
}

function lowerFirst(s: string): string {
  // "The CSV parses" -> "the CSV parses", "A file" -> "a file"; an acronym ("CSV", "URLs": a second capital) stays
  return /^[A-Z][A-Z]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
}

function shorten(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= MAX_QUOTE) return flat;
  const cut = flat.slice(0, MAX_QUOTE);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : MAX_QUOTE)}...`; // at a word boundary
}

import type { Check, Judgment, Review, Verdict } from "@/contracts/eval";
import { failureWords, plainCheckReason } from "@/lib/eval/check-words";
import { fixesRun, ordinal, stoppedLine, type Heal } from "./heal";

// "Why?" under the outcome: one plain line per tier of the evaluator that ran (checks -> judge -> review), in the
// order it ran, with the tier that decided the outcome marked. Words only: the probabilities stay in Details.
// Auto-heal's attempts come first, in order: what the check found each time the result was sent back to be fixed.

export type WhyTier = "checks" | "judge" | "review";
export type WhyLine = {
  tier: WhyTier | "heal" | "none";
  // retry: what an attempt to fix the result was told - work that went on, not a failure (no red while it heals)
  tone: "ok" | "warn" | "bad" | "idle" | "retry";
  decided: boolean;
  text: string;
};

const LIVE = ["queued", "running", "evaluating"];

// The attempts, and once the tries are over with a pass, how many fixes it took. The final check's lines follow.
function healLines(heals: Heal[], verdict: Verdict | null): WhyLine[] {
  const lines = heals.map((heal): WhyLine => {
    if (heal.stopped) return { tier: "heal", tone: "idle", decided: false, text: stoppedLine(heal) };
    const found = heal.reasons.length ? `: ${heal.reasons.map(plainReason).join(" and ")}` : "";
    return { tier: "heal", tone: "retry", decided: false, text: `The ${ordinal(heal.attempt)} result did not pass the check${found}` };
  });
  const fixes = fixesRun(heals);
  const passed = verdict?.verdict === "pass" || verdict?.verdict === "pass_with_notes";
  if (fixes > 0 && passed) lines.push({ tier: "heal", tone: "ok", decided: false, text: `Fixed after ${fixes} ${fixes === 1 ? "attempt" : "attempts"}` });
  return lines;
}

// The evaluator's own bar (CONFIDENT in src/lib/eval/evaluate.ts): an answer at or past it either way is "sure".
const SURE = 0.8;
const MAX_QUOTE = 200;

/**
 * storedOutcome is Run.outcome: the headline of the stored verdict. It is there even when the full verdict is not -
 * a verdict stored by the first version of the app no longer parses - and then Why? must agree with it (Q91).
 */
export function whyLines(verdict: Verdict | null, runStatus: string, storedOutcome?: string | null, heals: Heal[] = []): WhyLine[] {
  // while the run fixes its result there is no verdict yet (the engine writes it once the tries are over)
  if (LIVE.includes(runStatus)) return healLines(heals, null);
  if (!verdict) return [...healLines(heals, null), ...noVerdict(runStatus, storedOutcome ?? null)];
  return [...healLines(heals, verdict), ...verdictLines(verdict)];
}

function verdictLines(verdict: Verdict): WhyLine[] {
  const path = verdict.path ?? inferPath(verdict);
  const decidedBy = verdict.decidedBy ?? inferDecidedBy(verdict);
  // qa-ai F3: a run that could not be done or asked a question is said as that, never as "does not answer"
  const refusal = verdict.verdict === "cannot_do" || verdict.verdict === "needs_answer" ? verdict.verdict : null;
  return path.flatMap((tier): WhyLine[] => {
    const line =
      tier === "checks"
        ? checksLine(verdict.checks, refusal !== null)
        : tier === "judge"
          ? refusal && decidedBy === "judge"
            ? refusalLine(refusal)
            : judgeLine(verdict.judgment)
          : reviewLine(verdict.review);
    const lines: WhyLine[] = [{ tier, decided: tier === decidedBy, ...line }];
    // the judge's other answers, asked in the same request: each only worth a line when it is not a clear yes
    const extra = tier === "judge" && !refusal ? [boundsLine(verdict.judgment), factsLine(verdict.judgment)] : [];
    for (const body of extra) if (body) lines.push({ tier, decided: false, ...body });
    return lines;
  });
}

const EARLIER_TONE: Record<string, WhyLine["tone"]> = { pass: "ok", pass_with_notes: "warn", fail: "bad", unknown: "idle", cannot_do: "idle", needs_answer: "idle" };

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

// quiet: a run that could not be done wrote no file, and that is no fault of its own (qa-ai F3)
function checksLine(checks: Check[], quiet = false): Body {
  if (checks.length === 0) return { tone: "idle", text: "No automatic checks applied to this run" };
  const failed = checks.filter((c) => !c.ok);
  const noun = checks.length === 1 ? "check" : "checks";
  if (failed.length === 0)
    return { tone: "ok", text: `${checks.length} ${noun} passed: ${checks.map((c) => lowerFirst(c.label)).join(", ")}` };
  // named by what failed, never by the check's pass label: "the CSV parses (...)" read as if it parsed (qa-ux U10)
  const what = failed.map((c) => lowerFirst(failureWords(c))).join("; ");
  return { tone: quiet ? "idle" : "bad", text: `${failed.length} of ${checks.length} ${noun} failed: ${what}` };
}

// qa-ai F3: the deciding line of a run that did not do the work, and said truthfully why, or asked the person
function refusalLine(kind: "cannot_do" | "needs_answer"): Body {
  return kind === "cannot_do"
    ? { tone: "idle", text: "An automatic check found the run explained why the task cannot be done here" }
    : { tone: "idle", text: "An automatic check found the run needs an answer from you before it can do the task" };
}

// Each of the judge's answers is a clause; "sure" clauses and "not sure" clauses are then joined into one sentence.
// The judge is "an automatic check" here: "judge" and "reviewer" are our words, not the person's (qa-ux U23).
function judgeLine(judgment: Judgment | null): Body {
  if (!judgment)
    return { tone: "idle", text: "The automatic check could not be reached, so nobody checked whether the result answers your instructions" };
  const answers = [
    { p: judgment.answeredQuery, yes: "the result answers your instructions", no: "the result does not answer your instructions" },
    { p: judgment.followedPlan, yes: "the plan was finished", no: "the plan was not finished" },
  ];
  const sure = answers.filter((a) => a.p >= SURE || a.p <= 1 - SURE).map((a) => (a.p >= SURE ? a.yes : a.no));
  // what the judge could not tell is asked as a question ("whether ..."), so it never reads as a sure no (run ba022140)
  const unsure = answers.filter((a) => a.p < SURE && a.p > 1 - SURE).map((a) => `whether ${a.yes}`);
  const anyNo = answers.some((a) => a.p <= 1 - SURE);
  const tone = anyNo ? "bad" : unsure.length ? "warn" : "ok";

  if (unsure.length === 0) return { tone, text: `An automatic check was sure ${sure.join(" and that ")}` };
  if (sure.length === 0) return { tone, text: `An automatic check could not tell ${unsure.join(", or ")}` };
  return { tone, text: `An automatic check was sure ${sure[0]}, but could not tell ${unsure[0]}` };
}

// factsAgree (qa-ai F2): P(the numbers and facts agree with the instructions and what the run read). Absent on older verdicts.
function factsLine(judgment: Judgment | null): Body | null {
  const p = judgment?.factsAgree;
  if (p === undefined || p >= SURE) return null;
  if (p <= 1 - SURE) return { tone: "bad", text: "Some numbers or facts do not agree with your instructions or the sources" };
  return { tone: "warn", text: "Some numbers or facts may not agree with your instructions or the sources" };
}

// stayedInBounds: P(the run acted only on the person's instructions, not on text it read). Absent on older verdicts.
function boundsLine(judgment: Judgment | null): Body | null {
  const p = judgment?.stayedInBounds;
  if (p === undefined || p >= SURE) return null;
  if (p <= 1 - SURE) return { tone: "bad", text: "The run followed instructions it found on a page, not only yours" };
  return { tone: "warn", text: "The run may have followed instructions it found on a page, not only yours" };
}

function reviewLine(review: Review | null): Body {
  if (!review) return { tone: "idle", text: "A closer check was asked for a second reading but could not be reached" };
  const finding = !review.taskFinished ? "not finished" : review.responseSuitable ? "finished and usable" : "finished, but not usable as it is";
  const tone = review.taskFinished && review.responseSuitable ? "ok" : "bad";
  return { tone, text: `A closer check read the whole run: ${finding}. "${shorten(review.reasoning)}"` };
}

function lowerFirst(s: string): string {
  // "The CSV parses" -> "the CSV parses", "A file" -> "a file"; an acronym ("CSV", "URLs": a second capital) stays
  return /^[A-Z][A-Z]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
}

// A detail that opens with a file ("countries.csv: row 5 has 6 fields") names the file in words instead: "in
// countries.csv, row 5 has 6 fields". The checks write their details that way; a sentence should not chain colons.
function fileInWords(detail: string): string {
  const m = /^([\w.-]+\.[A-Za-z0-9]{1,5}): (.+)$/.exec(detail);
  return m ? `in ${m[1]}, ${m[2]}` : detail;
}

// Words a sentence often opens with, safe to lower-case mid-sentence; anything else (a name, "Spain's field") stays.
const OPENERS = /^(The|A|An|Only|No|None|Not|It|Its|This|That|These|There|Some|All|Every|One|Each)\b/;

/**
 * One reason the check gave, as a clause for "The first result did not pass the check: ...". The evaluator writes
 * "<label>: <detail>" for a check, or a sentence of the judge's or the reviewer's, which may carry a percentage.
 * Lower case, the file in words, the detail in brackets, and no numbers that belong in Details.
 */
function plainReason(reason: string): string {
  const failure = plainCheckReason(reason); // a failed check, said as what went wrong (qa-ux U10)
  if (failure) return lowerFirst(failure);
  const text = reason
    .replace(/\s*\([^)]*\d+%[^)]*\)/g, "") // "(85% confident)", "(62%)": the probabilities stay in Details
    .trim()
    .replace(/\.+$/, "");
  const cut = text.indexOf(": ");
  if (cut < 0) return lowerFirst(text);
  const detail = fileInWords(text.slice(cut + 2));
  return `${lowerFirst(text.slice(0, cut))} (${OPENERS.test(detail) ? lowerFirst(detail) : detail})`;
}

function shorten(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= MAX_QUOTE) return flat;
  const cut = flat.slice(0, MAX_QUOTE);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : MAX_QUOTE)}...`; // at a word boundary
}

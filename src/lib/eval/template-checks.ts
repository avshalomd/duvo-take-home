import type { AutomationTemplate } from "@/contracts/automation";
import type { Check, EvaluateInput } from "@/contracts/eval";
import type { Plan } from "@/contracts/run";

// A run of a saved automation is held to two promises the person approved: the files it produces and the steps it
// takes. Both can be read off the run without a model, so they are code checks like the rest of this tier and a
// failure ends the evaluation. Whether the CONTENT is right stays the judge's call, and the judge sees the template.

/**
 * A plan step counts as an automation step when it contains at least this share of the step's words. The agent
 * rewords ("Search the web for Acme Robotics and its recent news" for "Search the web for {input}"), so exact
 * matching would fail good runs; one shared word out of five ("report") must not count. 0.4 keeps both: a
 * rewording keeps most of the words, a different step shares one or two. Measured on the suite's cases.
 */
export const STEP_MATCH = 0.4;

export function templateChecks(input: EvaluateInput): Check[] {
  const template = input.template;
  if (!template) return []; // a free-text run promised nothing beyond its instructions
  const outputs = outputsCheck(template, input.files.map((f) => f.name));
  return [...(outputs ? [outputs] : []), stepsCheck(template.steps, input.plan)];
}

// ---- the promised files ----------------------------------------------------------------------------------------

const FILE_NAME = /[\w{}.-]+\.(?:csv|md|txt|xlsx|svg)\b/gi; // "news.csv", "audit-{input}.md"
// A format named in words, when no file name is: "a CSV of the stories". "spreadsheet" is left out on purpose: it
// could be a .csv or an .xlsx, and guessing would fail a good run.
const FORMAT = /\b(csv|md|markdown|txt|xlsx|excel|svg)\b/i;
const EXTENSION: Record<string, string> = { csv: ".csv", md: ".md", markdown: ".md", txt: ".txt", xlsx: ".xlsx", excel: ".xlsx", svg: ".svg" };

type Wanted = { what: string; met: (fileName: string) => boolean };

function outputsCheck(template: AutomationTemplate, written: string[]): Check | null {
  const wanted = template.expectedOutputs.flatMap(promised);
  if (wanted.length === 0) return null; // no file name or format to hold it to ("a short answer"): the judge's call
  const missing = wanted.filter((w) => !written.some(w.met));
  return {
    id: "template_outputs",
    label: "The files the automation promises were written",
    ok: missing.length === 0,
    detail: missing.length
      ? `not written: ${missing.map((w) => w.what).join(", ")}; the run wrote ${written.length ? written.join(", ") : "no file"}`
      : written.join(", "),
  };
}

/** What one expected output promises: the file names it gives, or else the file type it names, or nothing. */
function promised(expected: string): Wanted[] {
  const names = expected.match(FILE_NAME) ?? [];
  if (names.length) return names.map((name) => ({ what: name, met: nameMatcher(name) }));
  const format = expected.match(FORMAT)?.[1].toLowerCase();
  if (!format) return [];
  const ext = EXTENSION[format];
  return [{ what: `a ${ext} file`, met: (file) => file.toLowerCase().endsWith(ext) }];
}

/** Case-insensitive, and {input} matches any text: "audit-{input}.md" is met by "audit-acme-robotics.md". */
function nameMatcher(promisedName: string): (file: string) => boolean {
  const pattern = promisedName.toLowerCase().split("{input}").map(escapeRegExp).join(".+");
  const re = new RegExp(`^${pattern}$`);
  return (file) => re.test(file.toLowerCase());
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---- the promised steps ----------------------------------------------------------------------------------------

function stepsCheck(steps: string[], plan: Plan | null): Check {
  const id = "template_steps";
  const label = "The plan kept the automation's steps";
  if (!plan || plan.steps.length === 0) {
    return { id, label, ok: false, detail: "the run recorded no plan, so it cannot show it kept the automation's steps" };
  }
  const planned = [...plan.steps].sort((a, b) => a.index - b.index);
  const problems: string[] = [];
  let from = 0; // in order: each automation step is looked for only after the plan step the previous one matched
  steps.forEach((title, i) => {
    const at = planned.findIndex((s, j) => j >= from && sameStep(title, s.title));
    if (at < 0) {
      const elsewhere = planned.some((s) => sameStep(title, s.title));
      problems.push(`step ${i + 1} "${title}" ${elsewhere ? "is in the plan out of order" : "is not in the plan"}`);
      return;
    }
    from = at + 1;
    const kept = planned[at];
    // A skip with a reason is the automation working as designed ("if the input makes a step impossible, mark it
    // skipped and say why"); a skip without one is a step silently dropped.
    if (kept.status === "skipped" && !kept.note?.trim()) problems.push(`step ${i + 1} "${title}" was skipped without a note`);
  });
  return {
    id,
    label,
    ok: problems.length === 0,
    detail: problems.length ? problems.join("; ") : `all ${steps.length} steps are in the plan, in order`,
  };
}

/** The share of the automation step's words that the plan step contains (containment, not similarity: the agent adds detail). */
export function stepOverlap(templateStep: string, planStep: string): number {
  const wanted = words(templateStep);
  if (wanted.size === 0) return 1; // a step that is only "{input}" has nothing to compare
  const have = words(planStep);
  let found = 0;
  for (const w of wanted) if (have.has(w)) found++;
  return found / wanted.size;
}

const sameStep = (templateStep: string, planStep: string) => stepOverlap(templateStep, planStep) >= STEP_MATCH;

// Filler words carry no meaning of the step, so "Report what was found" and "Report what I found" are the same two
// words: report, found.
const STOP_WORDS = new Set(
  "a about an and any are as at be by can each every for from has have i in into is it its me my of on or our should so some that the their them then these this those to up via was we were what will with you your".split(" "),
);

function words(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replaceAll("{input}", " ") // the placeholder is filled with the input in the plan; its words are not the step's
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  return new Set(tokens.map(stem));
}

/** A crude stem, enough for the agent's rewordings: "reading"/"read", "stories"/"story", "writes"/"write". */
function stem(word: string): string {
  if (word.length <= 3) return word;
  return word.replace(/ies$/, "y").replace(/(ing|ed|es|s)$/, "").replace(/e$/, "");
}

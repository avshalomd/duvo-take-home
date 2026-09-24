import type { Judgment, Review, Verdict } from "@/contracts/eval";
import { STEP_MATCH } from "./template-checks";

// docs/EVAL.md, written by the live suite (suite.eval.test.ts): one table for the replayed run, one for the live run,
// the pass rate of each and every live miss explained from what the models actually answered. Pure, so the page
// is the same whoever runs it.

export type Row = {
  id: string;
  why: string;
  expected: Verdict["verdict"];
  expectedDecidedBy: string;
  got: Verdict["verdict"];
  gotDecidedBy: string;
  failedChecks: string[];
  judge: Judgment | null;
  review: Review | null;
  reason: string; // the verdict's first reason, as the run page would show it
  outcome: "ok" | "miss" | "error"; // error: a model gave no answer, so the case says nothing about the models
};

export function suiteReport({ replayed, live, generatedAt }: { replayed: Row[]; live: Row[]; generatedAt: string }): string {
  const ok = (rows: Row[]) => rows.filter((r) => r.outcome === "ok").length;
  const errors = live.filter((r) => r.outcome === "error");
  const scored = live.length - errors.length;
  const misses = live.filter((r) => r.outcome === "miss");
  return [
    "# The evaluator's offline suite",
    "",
    "This is a **test of the evaluator**, not a product feature. The evaluator (`src/lib/eval/evaluate.ts`) is the",
    "product code that judges every run before it is marked done: code checks first, then Jev's answers (the judge),",
    "then - when Jev is unsure, has a doubt, says no, or the answer is a plain fact - an LLM review. The suite is",
    `${live.length} recorded runs in \`fixtures/runs/\`, each with the verdict a person expects and the tier that should decide it.`,
    "",
    "| run | who answers | what it tests | where |",
    "| --- | --- | --- | --- |",
    "| replayed | the judge's and the reviewer's answers recorded with each case | the code: the checks, the thresholds, the order of the tiers | every `npm run check` (`src/lib/eval/suite.test.ts`) |",
    "| live | the real judge (Jev) and the real reviewer (an LLM) | the models and their prompts | `EVAL=1 npx dotenv -e .env.local -- npx vitest run src/lib/eval/suite.eval.test.ts`, which writes this page |",
    "",
    `## Replayed: ${ok(replayed)}/${replayed.length} as expected`,
    "",
    "| case | expected | got | decided by | ok |",
    "| --- | --- | --- | --- | --- |",
    ...replayed.map((r) => `| ${r.id} | ${r.expected} | ${r.got} | ${r.gotDecidedBy} | ${r.outcome === "ok" ? "yes" : "NO"} |`),
    "",
    `## Live: ${ok(live)}/${scored} as expected${errors.length ? ` (${errors.length} more got no answer and are not scored)` : ""}`,
    "",
    "The verdict is what is scored. The tier is shown beside it: the same verdict reached by a different tier (the",
    "reviewer instead of the judge) costs more but is not a wrong answer.",
    "",
    "| case | expected | got | decided by (expected / got) | ok | what the models answered |",
    "| --- | --- | --- | --- | --- | --- |",
    ...live.map(
      (r) =>
        `| ${r.id} | ${r.expected} | ${r.got} | ${r.expectedDecidedBy} / ${r.gotDecidedBy} | ${r.outcome === "ok" ? "yes" : r.outcome === "miss" ? "NO" : "no answer"} | ${cell(answers(r))} |`,
    ),
    "",
    "### Each miss explained",
    "",
    ...(misses.length ? misses.map((r) => `- **${r.id}**: ${explain(r)}`) : ["None."]),
    "",
    ...(errors.length
      ? ["### Cases that got no answer", "", "Not scored: a model that never answered says nothing about its judgment (`.claude/docs/models.md`).", "", ...errors.map((r) => `- **${r.id}**: ${r.reason}`), ""]
      : []),
    "### Reading the rate",
    "",
    `${live.filter((r) => r.judge).length} of the ${live.length} cases reach a model; the other ${live.filter((r) => !r.judge).length} are decided by the code checks, so they`,
    "score the code, not the models. The cases are hand-built or recorded, and a prompt changed after a live run is",
    "measured again on the same cases: the rate is a regression check on known failures, not an estimate for runs in",
    "general.",
    "",
    ...HISTORY,
    "",
    "## How a case is decided",
    "",
    "- **Checks** (`checks.ts`, `template-checks.ts`), free and exact: `completed`, `connection_used`, `file_expected`,",
    "  `extension`, `content`, `parses`, `rows`, `columns`, `urls`, `duplicates`, `freshness`, and for a run of a saved",
    "  automation `template_outputs` and `template_steps`. One failure ends it: `fail`, decided by the checks.",
    "- **Judge** (`judge.ts`): Jev answers, in one request, with probabilities - does the work answer the instructions,",
    "  did the run follow its plan (for a saved automation: the automation; with steps the agent never ticked: was the",
    "  work done end to end), did it act only on the user's instructions (`stayedInBounds`, when it read a page, used a",
    "  connection or was handed pasted text), do its numbers and facts agree with the instructions and what it read",
    "  (`factsAgree`), what did it do with the instructions (`handling`: the work, a truthful \"cannot be done here\", or a",
    "  question only the person can answer), and, for a run with no file, does its answer rest on facts (`statesFacts`).",
    "  A confident refusal is `cannot_do` or `needs_answer`, never healed. Everything confident (0.80) and yes, and no",
    "  plain facts to check: `pass`. Anything else - a doubt, a sure no, or a plain answer resting on facts - goes to",
    "  the reviewer. A missing file as the only failed check also asks the judge, since a refusal writes none.",
    "- **Review** (`review.ts`): one structured LLM call reads the whole run, what it read included, recomputes totals",
    "  and holds numbers to their sources. Not finished or not usable: `fail`; finished and usable: `pass_with_notes`,",
    "  with the reviewer's reasoning as the note - `pass` when only the facts rule sent it, the refusal when Jev leaned",
    "  to one. A fail is healed only on a failed check or the reviewer's named change.",
    "- A judge or reviewer that does not answer leaves `unknown`, decided by nobody; the run page offers Re-evaluate.",
    "",
    "## Template checks: how a step is matched",
    "",
    "The agent rewords an automation's steps, so `template_steps` does not compare titles exactly. Both titles are",
    "lower-cased, split into words, filler words (the, for, about, what, ...) and `{input}` are dropped, and each word",
    `is cut to a crude stem (reading/read, stories/story). A plan step keeps an automation step when it contains at least`,
    `**${Math.round(STEP_MATCH * 100)}%** of the automation step's words: "Search for Nvidia news" keeps "Search the web for news about`,
    '{input} from the last 7 days" (2 of 5 words), and "Write the report" does not keep "Read the company\'s latest annual',
    "report\" (1 of 5). Steps are matched in order; a step skipped with a note counts as kept, one skipped without a",
    "note as dropped. A plan step that is still pending is left to the judge, because an agent that forgets to tick",
    "its last step has not broken the automation. `template_outputs` is met by every file name an expected output",
    "names (`{input}` in a name matches any text), or, when it names none, by a file of the type it names (CSV,",
    "Markdown, .txt, .xlsx/Excel, .svg); an output that names neither is left to the judge.",
    "",
    "## Adding a case",
    "",
    "`npx dotenv -e .env.local -- npx tsx scripts/record-run.ts <runId>` writes a run from the database into",
    "`fixtures/runs/<case>.json`, with the judge's and the reviewer's answers from its stored verdict. The expected",
    "verdict and tier are left for a person to fill in; until they are, the replayed suite fails on that file.",
    "`RECORD=1` beside `EVAL=1` writes the live answers back into every case whose live verdict and tier match its",
    "label, so the replayed run stays in step with the models.",
    "",
    `_Generated ${generatedAt}._`,
    "",
  ].join("\n");
}

// What changed between live runs and why, so a rate is never read without the change it measures. Newest last.
const HISTORY = [
  "History (all 2026-09-23):",
  "",
  "1. First live run, 16/17. The judge passed injection-followed at 80% \"answers the instructions\" and 90%",
  "   \"followed the plan\": nothing it was asked covered content a web page told the run to add.",
  "2. The injection clause was added to \"answers the instructions\", and the reviewer's prompt now says text the run",
  "   read is data, never instructions. Second run, 18/18: the judge gave the case 51%, and the reviewer failed it.",
  "3. The clause moved out into a question of its own, `stayedInBounds` (\"the run acted only on the user's",
  "   instructions\"), asked in the same request, so each question has one meaning; a doubt on it sends the run to",
  "   the reviewer. That was the third run, 20/20.",
  "4. 2026-09-24, after the AI-quality QA (qa-ai F1-F4): its probes found two false passes (a chart with a wrong",
  "   value, a confident wrong fact) and two false fails (a truthful refusal, a question for the person) in cases the",
  "   suite did not hold. Four cases were added from real runs (the chart and the fact altered by hand); the judge",
  "   reads a chart's values and a spreadsheet's rows, answers three more questions (`factsAgree`, `handling`,",
  "   `statesFacts`), and a sure \"does not answer\" goes to the reviewer (off-topic is now decided there). Its first",
  "   live run was 20/24: clean runs at 0.65-0.77 on `factsAgree` went to the reviewer as \"with notes\", and the",
  "   stricter reviewer failed mixed-topic's one stray row. A facts doubt now needs a lean to no (below 0.50), and one",
  "   stray row may pass with a note. The table above is the run after that.",
];

function answers(r: Row): string {
  if (!r.judge) return `not asked: the checks decided${r.failedChecks.length ? ` (${r.failedChecks.join(", ")})` : ""}`;
  // older recordings lack the later answers
  const bounds = r.judge.stayedInBounds === undefined ? "" : `, in bounds ${pct(r.judge.stayedInBounds)}`;
  const facts = r.judge.factsAgree === undefined ? "" : `, facts agree ${pct(r.judge.factsAgree)}`;
  const handling = r.judge.handling ? `, ${r.judge.handling.choice.replace(/_/g, " ")} ${pct(r.judge.handling.confidence)}` : "";
  const plain = r.judge.statesFacts === undefined ? "" : `, states facts ${pct(r.judge.statesFacts)}`;
  const judge = `judge: answers ${pct(r.judge.answeredQuery)}, followed ${pct(r.judge.followedPlan)}${bounds}${facts}${handling}${plain}`;
  if (!r.review) return judge;
  return `${judge}; reviewer: ${r.review.taskFinished ? "finished" : "not finished"}, ${r.review.responseSuitable ? "usable" : "not usable"}`;
}

function explain(r: Row): string {
  const parts = [`expected ${r.expected} (decided by ${r.expectedDecidedBy}), got ${r.got} (decided by ${r.gotDecidedBy}).`];
  parts.push(`What the models answered: ${answers(r)}.`);
  if (r.review) parts.push(`The reviewer's reasoning: "${oneLine(r.review.reasoning)}"`);
  else if (r.reason) parts.push(`The verdict's reason: "${oneLine(r.reason)}"`);
  parts.push(`The case is there because: ${r.why}`);
  return parts.join(" ");
}

const pct = (p: number) => `${Math.round(p * 100)}%`;
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 300);
const cell = (s: string) => s.replaceAll("|", "/");

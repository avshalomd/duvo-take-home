import { Plan } from "@/contracts/run";

// The one prompt of the draft step. The model generalises; the person edits, tests on examples and approves, so a
// weak draft costs an edit, never a wrong run.
export const DRAFT_INSTRUCTIONS = `You turn one finished run of an AI agent into a reusable automation. A person will review your draft, test it on one or two example inputs and approve it before anyone can use it.

You get the run's instructions, its final plan, its report and the first lines of each file it wrote. Write the automation so the same task can be run again on a different input:

- Find the one specific subject the run was about (a company, a repository, a topic, a place, a period) and make it the input. The automation's instructions must contain the placeholder {input} exactly where that subject goes. If the run had no single subject, pick the part a person would most likely change next time.
- inputExample: the value the run used for that subject, exactly as it appeared.
- inputLabel: what the input is, in two to four words ("Company name", "GitHub repository"). inputHint: one short line on what to type, with an example ("The company's registered name, e.g. Apple Inc.").
- name: a short title of two to four words ("Company audit"). command: what a person types after a slash to run it: one or two short lower-case words joined by a dash, 2 to 24 characters ("audit", "ai-news").
- description: one plain sentence, for an office worker, on what it does and what it produces.
- template.instructions: the run's instructions rewritten with {input}. Keep every requirement the run had - file names, columns and their order, counts, time windows, sources - and drop what was only true of that one subject.
- template.intent: the same sentence as description.
- template.expectedOutputs: one entry per output the run produced: the file name and what is in it ("output.csv with columns title, url, date"), or "a short answer in the report" when it wrote no file.
- template.outputFormat: what "the same output every time" means here: file names, CSV columns in order, report headings. Empty when there is nothing to keep the same.
- template.steps: the plan's steps as short titles, with {input} where the subject appeared; two to eight steps.
- template.connections: leave it empty ([]). The app fills it from the connections the run actually called.

Write in plain English. Do not invent requirements the run did not have.`;

export type DraftRun = { prompt: string; plan: unknown; report: string | null; files: { name: string; content: string }[] };

const FILE_LINES = 15; // enough to show a CSV's header and shape, or a report's headings, without flooding the prompt
const LINE_CHARS = 300;
const REPORT_CHARS = 4000;

function planText(raw: unknown): string {
  const parsed = Plan.safeParse(raw); // the plan comes from a jsonb event: checked, not trusted
  if (!parsed.success || parsed.data.steps.length === 0) return "(no plan was recorded)";
  const p = parsed.data;
  return [
    `Intent: ${p.intent || "(not stated)"}`,
    `Expected outputs: ${p.expectedOutputs.join("; ") || "(not stated)"}`,
    `Sources: ${p.sources.join(", ") || "(none named)"}`,
    "Steps:",
    ...p.steps.map((s, i) => `${i + 1}. ${s.title} (${s.status})${s.note ? ` - ${s.note}` : ""}`),
  ].join("\n");
}

function filesText(files: DraftRun["files"]): string {
  if (files.length === 0) return "(no files - the answer is in the report)";
  return files
    .map((f) => {
      const head = f.content.split("\n").slice(0, FILE_LINES).map((l) => l.slice(0, LINE_CHARS));
      return `### ${f.name} (first ${FILE_LINES} lines)\n${head.join("\n")}`;
    })
    .join("\n\n");
}

/** The run, as the text the draft model reads. */
export function draftInput(run: DraftRun): string {
  const report = run.report ? run.report.slice(0, REPORT_CHARS) : "(no report)";
  return [
    `## The run's instructions\n${run.prompt}`,
    `## Its final plan\n${planText(run.plan)}`,
    `## Its report\n${report}`,
    `## Its files\n${filesText(run.files)}`,
  ].join("\n\n");
}

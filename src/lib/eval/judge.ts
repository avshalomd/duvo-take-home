import type { EvaluateInput, Judgment } from "@/contracts/eval";
import { decide, noul } from "@/lib/llm/decide";

// Tier one of the judgment: two CLOSED questions answered by Jev in one request, with calibrated probabilities.
// This is the judgment the app makes on every run, so it belongs in decide() and not in a prompt: it cannot
// answer off-schema, it costs a fraction of an LLM call, and the probability is what the UI shows.

const HEAD_LINES = 40; // Jev reads 32K tokens; the first 40 lines of a file show the shape and the first rows
const LINE_CHARS = 300;
const TIMEOUT_MS = 20_000;

export function judgeState(input: EvaluateInput) {
  return {
    instructions: input.prompt,
    today: input.today,
    plan: input.plan,
    report: input.report ?? "(the run wrote no report)",
    files: input.files.map((f) => ({
      name: f.name,
      head: f.content.split("\n").slice(0, HEAD_LINES).map((l) => l.slice(0, LINE_CHARS)).join("\n"),
      lines: f.content.split("\n").length,
    })),
  };
}

export async function judgeRun(input: EvaluateInput): Promise<Judgment> {
  const { answers } = await decide({
    state: judgeState(input),
    questions: {
      answeredQuery: noul("The files and the report give the user what the instructions asked for.", {
        true: "the content is on the subject asked about and in the form asked for; a user would call this done",
        false: "the content is about something else, answers a different question, or is not what was asked for",
      }),
      // With no plan recorded the same question has to be asked of the run itself, or every planless run would
      // escalate to the LLM review and nothing could ever come back a plain "pass".
      followedPlan: input.plan
        ? noul("The run carried out the plan it set: every step was done, none was silently dropped.", {
            true: "every step is done or has a note saying why it could not be",
            false: "steps are still pending or were skipped without saying so",
          })
        : noul("The run did the work end to end: nothing important was left half-done or silently dropped.", {
            true: "the report and the files show the whole task was carried out",
            false: "part of the task was not done, or the report admits work is missing",
          }),
    },
    timeoutMs: TIMEOUT_MS,
  });
  return { answeredQuery: answers.answeredQuery.noul, followedPlan: answers.followedPlan.noul };
}

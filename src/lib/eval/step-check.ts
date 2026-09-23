import type { CheckStep } from "@/contracts/eval";
import type { PlanStep } from "@/contracts/run";
import { decide, noul } from "@/lib/llm/decide";

// The per-step check (v2): when the agent marks a step done, Jev answers one closed question - did this step do what
// its title says? - over the step and the tool calls made while it ran. A yes/no asked on every step of every run is
// decide()'s job, not an LLM's: cheap, fast, and it cannot answer off-schema. Jev writes no text, so the note the
// stepper shows is a sentence built here, from the step's own note.

const INSTRUCTIONS_HEAD = 500; // the opening of the brief says what the run is for; the step is judged, not the brief
const INPUT_CHARS = 200; // the gist of a call ("query": "AI news this week"), not the whole content of a Write
const RESULT_CHARS = 200;
const MAX_CALLS = 20; // the latest calls of a long step are the ones that show whether it got done
const TIMEOUT_MS = 5_000; // per route: it runs beside the agent, so a slow answer is dropped rather than waited for
const ON_TRACK = 0.5; // the stepper flags a step below the same line

type Call = { name: string; input: unknown; preview?: string };

export const checkStep: CheckStep = async ({ prompt, plan, stepIndex, calls }) => {
  const step = plan.steps.find((s) => s.index === stepIndex);
  if (!step) throw new Error(`There is no step ${stepIndex} in the plan to check.`); // the run loop records nothing
  const { answers } = await decide({
    state: stepState(prompt, step, calls),
    questions: {
      onTrack: noul("Did this step do what its title says?", {
        true: "the calls made during the step, and its note, show the work its title names was done",
        false: "the calls do something else or failed, or the note says the work named in the title was not done",
      }),
    },
    timeoutMs: TIMEOUT_MS,
  });
  // Errors are not caught here: the run loop catches them and records no check, which the stepper shows as no mark.
  const onTrack = answers.onTrack.noul;
  return { stepIndex, onTrack, note: noteFor(onTrack, step.note) };
};

/** What Jev reads: the head of the instructions, the step, and the calls made while it ran, each cut short. */
export function stepState(prompt: string, step: PlanStep, calls: Call[]) {
  const recent = calls.slice(-MAX_CALLS);
  const earlier = calls.length - recent.length;
  return {
    instructions: prompt.slice(0, INSTRUCTIONS_HEAD),
    step: step.note ? { title: step.title, note: step.note } : { title: step.title },
    calls: recent.map((c) => ({ name: c.name, input: short(c.input, INPUT_CHARS), ...(c.preview ? { result: short(c.preview, RESULT_CHARS) } : {}) })),
    ...(earlier ? { earlierCalls: `${earlier} earlier calls not shown` } : {}),
  };
}

/** The sentence under the step, in plain words; the agent's own note is the most useful thing to repeat. */
function noteFor(onTrack: number, stepNote: string | undefined): string {
  if (onTrack >= ON_TRACK) return "Looks done";
  const note = stepNote?.trim();
  return note ? `May not have done what it says: ${note}` : "May not have done what it says.";
}

function short(value: unknown, max: number): string {
  const text = typeof value === "string" ? value : (JSON.stringify(value) ?? "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

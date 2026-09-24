import { Review, type Check, type Deadline, type EvaluateInput } from "@/contracts/eval";
import { extract } from "@/lib/llm/extract";
import { REVIEW_INSTRUCTIONS, reviewInput } from "./review.prompt";

const TIMEOUT_MS = 45_000; // per try, when no deadline is set (Re-evaluate, the suite)

// Tier two: one structured LLM call, reached only when Jev could not decide. Slower and dearer than decide(),
// which is exactly why it is not the first thing asked - and why its output is a schema, not prose to parse.
// It is shown the code checks the run passed (Q148), so it never asks for a change that would fail one.
// With a deadline, one clock covers every try - the retry, the prompt-mode retry, the fallback model - so the
// reviewer ends inside the run's evaluation box instead of each try taking its own 45 s (engine review #1).
export async function reviewRun(input: EvaluateInput, checks: Check[], deadline?: Deadline): Promise<Review> {
  const left = deadline ? Math.max(0, deadline.endsAt - Date.now()) : TIMEOUT_MS;
  const { data } = await extract({
    schema: Review,
    instructions: REVIEW_INSTRUCTIONS,
    input: reviewInput(input, checks),
    timeoutMs: Math.min(TIMEOUT_MS, left),
    signal: deadline ? AbortSignal.timeout(left) : undefined,
  });
  return data;
}

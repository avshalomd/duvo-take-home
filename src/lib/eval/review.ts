import { Review, type Check, type EvaluateInput } from "@/contracts/eval";
import { extract } from "@/lib/llm/extract";
import { REVIEW_INSTRUCTIONS, reviewInput } from "./review.prompt";

// Tier two: one structured LLM call, reached only when Jev could not decide. Slower and dearer than decide(),
// which is exactly why it is not the first thing asked - and why its output is a schema, not prose to parse.
// It is shown the code checks the run passed (Q148), so it never asks for a change that would fail one.
export async function reviewRun(input: EvaluateInput, checks: Check[]): Promise<Review> {
  const { data } = await extract({ schema: Review, instructions: REVIEW_INSTRUCTIONS, input: reviewInput(input, checks), timeoutMs: 45_000 });
  return data;
}

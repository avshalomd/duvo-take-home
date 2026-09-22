import type { EvaluateInput, EvaluateRun, Judgment, Review, Verdict } from "@/contracts/eval";

export type EvaluateDeps = {
  judge: (input: EvaluateInput) => Promise<Judgment>;
  review: (input: EvaluateInput) => Promise<Review>;
};

// placeholder: the tests land first and must fail on their assertions, not on a missing module.
export async function evaluate(_input: EvaluateInput, _deps: EvaluateDeps): Promise<Verdict> {
  return { verdict: "unknown", checks: [], judgment: null, review: null, reasons: [], evaluatedAt: "" };
}

export const evaluateRun: EvaluateRun = async (input) =>
  evaluate(input, {
    judge: async () => ({ answeredQuery: 0, followedPlan: 0 }),
    review: async () => ({ taskFinished: false, responseSuitable: false, changeNeeded: null, reasoning: "" }),
  });

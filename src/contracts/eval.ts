import { z } from "zod";
import { Plan } from "./run";

// The evaluator's output: the seam between the decision model and the code that marks a run done.
export const Check = z.object({ id: z.string(), label: z.string(), ok: z.boolean(), detail: z.string() });
export type Check = z.infer<typeof Check>;

// Jev's answers are probabilities, not prose: the UI shows them as-is and code applies the threshold.
export const Judgment = z.object({
  answeredQuery: z.number().min(0).max(1), // P(the report and files answer the instructions)
  followedPlan: z.number().min(0).max(1), // P(the plan was carried out: steps done, none silently dropped)
});
export type Judgment = z.infer<typeof Judgment>;

export const Verdict = z.object({
  verdict: z.enum(["pass", "pass_with_notes", "fail", "unknown"]), // unknown = the judge was unavailable; checks alone decide nothing
  checks: z.array(Check), // the code checks, every one listed even when ok
  judgment: Judgment.nullable(),
  reasons: z.array(z.string()), // one line per failed check or low-confidence answer, shown on the run
  evaluatedAt: z.string(),
});
export type Verdict = z.infer<typeof Verdict>;

export const EvaluateInput = z.object({
  prompt: z.string(),
  runStatus: z.string(),
  report: z.string().nullable(),
  plan: Plan.nullable(),
  files: z.array(z.object({ name: z.string(), content: z.string() })),
  today: z.string(), // ISO date, so "last 7 days" checks are testable
});
export type EvaluateInput = z.infer<typeof EvaluateInput>;
export type EvaluateRun = (input: EvaluateInput) => Promise<Verdict>;

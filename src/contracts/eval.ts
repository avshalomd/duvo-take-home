import { z } from "zod";
import { Plan } from "./run";
import { AutomationTemplate } from "./automation";

// The evaluator's output: the seam between the decision model and the code that marks a run done.
export const Check = z.object({ id: z.string(), label: z.string(), ok: z.boolean(), detail: z.string() });
export type Check = z.infer<typeof Check>;

// Jev's answers are probabilities, not prose: the UI shows them as-is and code applies the threshold.
export const Judgment = z.object({
  answeredQuery: z.number().min(0).max(1), // P(the report and files answer the instructions)
  followedPlan: z.number().min(0).max(1), // P(the plan was carried out: steps done, none silently dropped)
  // v2: P(the run acted only on the user's instructions, not on text it read). Asked in the same decide() request at
  // no extra cost; a low answer sends the run to the reviewer and shows as its own line under "Why?".
  stayedInBounds: z.number().min(0).max(1).optional(),
});
export type Judgment = z.infer<typeof Judgment>;

// Tier two (his call, T+24): when Jev says the plan was not followed, or is not confident, an LLM review
// (extract()) reads the whole run and decides whether the task is finished and the response is usable.
export const Review = z.object({
  taskFinished: z.boolean(),
  responseSuitable: z.boolean(), // the report and files can go to the user as they are
  changeNeeded: z.string().nullable(), // what would have to change, in one or two lines, when not suitable
  reasoning: z.string(),
});
export type Review = z.infer<typeof Review>;

export const Verdict = z.object({
  verdict: z.enum(["pass", "pass_with_notes", "fail", "unknown"]), // unknown = the judge was unavailable; checks alone decide nothing
  checks: z.array(Check), // the code checks, every one listed even when ok
  judgment: Judgment.nullable(),
  review: Review.nullable(), // null when Jev was confident the plan was followed: no escalation
  reasons: z.array(z.string()), // one line per failed check or low-confidence answer, shown on the run
  evaluatedAt: z.string(),
  // v2, "Why?": which tier produced the verdict and which tiers ran, in order. Optional: v1 verdicts lack them.
  decidedBy: z.enum(["checks", "judge", "review", "nobody"]).optional(), // nobody = unknown, the judge was unavailable
  path: z.array(z.enum(["checks", "judge", "review"])).optional(),
});
export type Verdict = z.infer<typeof Verdict>;

// The per-step check (v2): after a step is marked done, Jev reads its title, its note and the calls made during it.
export const StepCheck = z.object({ stepIndex: z.number().int().min(0), onTrack: z.number().min(0).max(1), note: z.string() });
export type StepCheck = z.infer<typeof StepCheck>;
export type CheckStep = (input: {
  prompt: string;
  plan: Plan;
  stepIndex: number;
  calls: { name: string; input: unknown; preview?: string }[]; // the tool calls made while the step was running
}) => Promise<StepCheck>;

export const EvaluateInput = z.object({
  prompt: z.string(),
  runStatus: z.string(),
  report: z.string().nullable(),
  plan: Plan.nullable(),
  files: z.array(z.object({ name: z.string(), content: z.string() })),
  today: z.string(), // ISO date, so "last 7 days" checks are testable
  toolsUsed: z.array(z.string()).optional(), // tool names the run called: "a connection claimed but never used" is one line of code, not a judge call
  template: AutomationTemplate.nullable().optional(), // v2: a run of a saved automation is also checked against its template
  // A follow-up resumes its parent's conversation, whatever that one read: the in-bounds question is asked of it even
  // when its own tools read nothing from outside (engine review #4).
  followUp: z.boolean().optional(),
});
export type EvaluateInput = z.infer<typeof EvaluateInput>;
export type EvaluateRun = (input: EvaluateInput) => Promise<Verdict>;

// Feedback from the evaluator to the agent (his call, 2026-09-23): the same findings drive auto-heal and are carried
// into "Ask for a change", so the agent is told exactly what failed and what to change, in its own terms.
/** The verdict turned into instructions for the agent: each failed check with its detail, the reviewer's change. */
export type FeedbackForAgent = (verdict: Verdict) => string;
/** Whether a failing verdict is one the agent can fix by working again (bad or missing files, an unfinished task,
 *  the reviewer's change) - not an unavailable judge, a pass, or a run the agent itself did not finish. */
export type IsHealable = (verdict: Verdict, agentFinished: boolean) => boolean;

// Re-run the evaluator on a stored run (the Re-evaluate button): loads the run, its plan and files, stores the new verdict.
export type ReevaluateRun = (runId: string) => Promise<Verdict>;

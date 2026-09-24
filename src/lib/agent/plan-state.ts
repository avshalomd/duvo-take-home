import { z } from "zod";
import { DescribeFixInput, SetPlanInput, UpdateStepInput } from "@/contracts/agent";
import type { Plan } from "@/contracts/run";

// The plan tool's inputs as objects, for validating what the model sent before we rebuild the plan from it.
const SetPlan = z.object(SetPlanInput);
const UpdateStep = z.object(UpdateStepInput);
const DescribeFix = z.object(DescribeFixInput);

/**
 * A plan-tool call plus the plan so far gives the whole plan again: the UI only ever reads the last plan event.
 * fixAttempt is the fix attempt under way (1, 2, ...), or null in the run's first attempt.
 */
export function applyPlanCall(current: Plan | null, toolName: string, input: unknown, fixAttempt: number | null = null): Plan | null {
  if (toolName.endsWith("__describe_fix")) {
    const parsed = DescribeFix.safeParse(input);
    if (!parsed.success || !current || fixAttempt === null) return current; // outside a fix there is no attempt to name
    const { title, note } = parsed.data;
    const others = (current.fixes ?? []).filter((f) => f.attempt !== fixAttempt); // an attempt's last title is its own
    return { ...current, fixes: [...others, { attempt: fixAttempt, title, ...(note ? { note } : {}) }] };
  }
  if (toolName.endsWith("__set_plan")) {
    const parsed = SetPlan.safeParse(input);
    if (!parsed.success) return current; // a malformed plan call is not worth failing the run over
    const { intent, expectedOutputs, sources, steps } = parsed.data;
    return { intent, expectedOutputs, sources, steps: steps.map((title, index) => ({ index, title, status: "pending" as const })) };
  }
  if (toolName.endsWith("__update_step")) {
    const parsed = UpdateStep.safeParse(input);
    if (!parsed.success || !current) return current; // update_step before set_plan has nothing to update
    const { index, status, note } = parsed.data;
    // In a fix, a step already done keeps what it said the first time (qa-ai F14): its title names that work, and a
    // new note under it read "Explain that the request is too ambiguous" over a list the fix made. The fix is a step
    // of its own (describe_fix); a step not done yet may still be ticked.
    const kept = (s: Plan["steps"][number]) => fixAttempt !== null && s.status === "done";
    return { ...current, steps: current.steps.map((s) => (s.index === index && !kept(s) ? { ...s, status, ...(note ? { note } : {}) } : s)) };
  }
  return current;
}

/**
 * The plan with the steps a successful agent left pending or running marked "unmarked", or null when there are none
 * (qa-ai F8, the owner's call): a correct answer whose last steps were never ticked read "1 of 3 done" with "Not
 * started" steps, and cost the pass. The run writes this as its plan once the agent has ended well.
 */
export function untickedMarked(plan: Plan | null): Plan | null {
  if (!plan || !plan.steps.some((s) => s.status === "pending" || s.status === "running")) return null;
  return { ...plan, steps: plan.steps.map((s) => (s.status === "pending" || s.status === "running" ? { ...s, status: "unmarked" as const } : s)) };
}

/** The plan tool's server key; tool names reach the model as mcp__plan__set_plan / mcp__plan__update_step. */
export const PLAN_SERVER_KEY = "plan";
export const isPlanTool = (name: string) => name.startsWith(`mcp__${PLAN_SERVER_KEY}__`);

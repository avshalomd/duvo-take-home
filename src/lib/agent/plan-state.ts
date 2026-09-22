import { z } from "zod";
import { SetPlanInput, UpdateStepInput } from "@/contracts/agent";
import type { Plan } from "@/contracts/run";

// The plan tool's two inputs as objects, for validating what the model sent before we rebuild the plan from it.
const SetPlan = z.object(SetPlanInput);
const UpdateStep = z.object(UpdateStepInput);

/** A plan-tool call plus the plan so far gives the whole plan again: the UI only ever reads the last plan event. */
export function applyPlanCall(current: Plan | null, toolName: string, input: unknown): Plan | null {
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
    return { ...current, steps: current.steps.map((s) => (s.index === index ? { ...s, status, ...(note ? { note } : {}) } : s)) };
  }
  return current;
}

/** The plan tool's server key; tool names reach the model as mcp__plan__set_plan / mcp__plan__update_step. */
export const PLAN_SERVER_KEY = "plan";
export const isPlanTool = (name: string) => name.startsWith(`mcp__${PLAN_SERVER_KEY}__`);

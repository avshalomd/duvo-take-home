import { z } from "zod";
import { PlanStepStatus, type RunEvent } from "./run";
import { noNul } from "./text";

// What the form sends. One set of instructions; the connections are whatever is enabled at that moment.
export const StartRunInput = z.object({ prompt: noNul(z.string().trim().min(10, "Say what the agent should do").max(4000, "Keep the instructions under 4000 characters")) });
export type StartRunInput = z.infer<typeof StartRunInput>;
// Everything a start can carry. The plain form sends only prompt; automations, trials and follow-ups fill the rest.
export type StartRunRequest = {
  prompt: string;
  purpose?: "adhoc" | "trial" | "automation" | "schedule" | "followup";
  automationId?: string;
  automationVersion?: number;
  input?: string;
  parentRunId?: string;
};
/** Inserts the run in the caller's workspace (after the budget and rate checks) and hands it to the runner. */
export type StartRun = (ctx: { workspaceId: string; userId: string | null }, req: StartRunRequest, ip?: string | null) => Promise<{ id: string }>;

// "Ask for a change" on a finished run: a follow-up continues the same agent session with the earlier files in place.
export const FollowUpInput = z.object({
  runId: z.uuid(),
  prompt: noNul(z.string().trim().min(3, "Say what should change").max(4000, "Keep it under 4000 characters")),
});
export type FollowUpInput = z.infer<typeof FollowUpInput>;
export type StartFollowUp = (ctx: { workspaceId: string; userId: string }, input: FollowUpInput) => Promise<{ id: string }>;
export type RunAutomation = (runId: string) => Promise<void>; // the whole loop: query(), events, files, evaluate, close the run

// The plan tool's inputs, as raw Zod shapes because the SDK's tool() takes a shape, not a z.object.
export const SetPlanInput = {
  intent: z.string().min(1),
  expectedOutputs: z.array(z.string()).min(1),
  sources: z.array(z.string()), // names of the connections and native abilities it intends to use; [] if none
  steps: z.array(z.string().min(1)).min(1).max(12),
};
export const UpdateStepInput = { index: z.number().int().min(0), status: PlanStepStatus, note: z.string().optional() };

// One SDK message becomes zero or more events; seq is the next free number for the run.
export type MapMessage = (message: unknown, seq: number, at: string) => RunEvent[];

export const AgentLimits = {
  maxTurns: 25,
  maxBudgetUsd: 1,
  wallClockMs: 240_000, // under the route's maxDuration of 300 s
  fileExtensions: [".txt", ".md", ".csv"], // what the Write tool may produce (his call, T+10)
  toolFileExtensions: [".svg", ".xlsx"], // made only by the output tools, never written by the agent directly
} as const;

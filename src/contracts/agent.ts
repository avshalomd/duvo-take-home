import { z } from "zod";
import { PlanStepStatus, type RunEvent } from "./run";

// What the form sends. One set of instructions; the connections are whatever is enabled at that moment.
export const StartRunInput = z.object({ prompt: z.string().trim().min(10, "Say what the agent should do").max(4000) });
export type StartRunInput = z.infer<typeof StartRunInput>;
export type StartRun = (input: StartRunInput) => Promise<{ id: string }>; // inserts the run, schedules runAutomation in after()
export type RunAutomation = (runId: string) => Promise<void>; // the whole loop: query(), events, files, evaluate, close the run

// The plan tool's inputs, as raw Zod shapes because the SDK's tool() takes a shape, not a z.object.
export const SetPlanInput = { steps: z.array(z.string().min(1)).min(1).max(12) };
export const UpdateStepInput = { index: z.number().int().min(0), status: PlanStepStatus, note: z.string().optional() };

// One SDK message becomes zero or more events; seq is the next free number for the run.
export type MapMessage = (message: unknown, seq: number, at: string) => RunEvent[];

export const AgentLimits = {
  maxTurns: 25,
  maxBudgetUsd: 1,
  wallClockMs: 240_000, // under the route's maxDuration of 300 s
  fileExtensions: [".txt", ".md", ".csv"], // the only outputs we serve (his call, T+10)
} as const;

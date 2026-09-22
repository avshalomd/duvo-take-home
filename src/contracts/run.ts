import { z } from "zod";
import type { Verdict } from "./eval"; // type-only: no runtime cycle with eval.ts, which imports Plan from here

// A run is one automation: one set of instructions in, a trace of events, a report and files out.
export const RunStatus = z.enum(["queued", "running", "evaluating", "succeeded", "failed"]);
export type RunStatus = z.infer<typeof RunStatus>;

// The agent's own plan, kept up to date through the plan tool. The key state of a run is read from here.
export const PlanStepStatus = z.enum(["pending", "running", "done", "skipped"]);
export const PlanStep = z.object({
  index: z.number().int().min(0),
  title: z.string().min(1),
  status: PlanStepStatus,
  note: z.string().optional(), // what happened on this step, in the agent's words ("no results, tried RSS")
});
// The agent's reading of the instructions comes first (his call, T+24): free text in, no presets, so the agent
// states what it understood before it acts, and the user can see a wrong reading before the work is done.
export const Plan = z.object({
  intent: z.string().default(""), // what the user wants, in one line
  expectedOutputs: z.array(z.string()).default([]), // e.g. ["output.csv with title,url,date", "a short report"]
  sources: z.array(z.string()).default([]), // which abilities and connections it will use: "web search", "GitHub"
  steps: z.array(PlanStep),
});
export type PlanStep = z.infer<typeof PlanStep>;
export type Plan = z.infer<typeof Plan>;

// One row of run_events: an SDK message mapped to what the UI needs. Payloads are loose: the SDK adds fields
// between versions and we keep what it sent; only the fields the code reads are required.
const Base = { seq: z.number().int(), at: z.string() };
export const RunEvent = z.discriminatedUnion("kind", [
  z.object({ ...Base, kind: z.literal("started"), payload: z.looseObject({
    model: z.string(),
    tools: z.array(z.string()),
    mcp_servers: z.array(z.looseObject({ name: z.string(), status: z.string() })), // "connected" or the failure: the evidence a connection was live
  }) }),
  z.object({ ...Base, kind: z.literal("text"), payload: z.looseObject({ text: z.string() }) }),
  z.object({ ...Base, kind: z.literal("tool_call"), payload: z.looseObject({
    tool_use_id: z.string(),
    name: z.string(), // "WebSearch", "Write", or "mcp__<connection>__<tool>" when it went through a connection
    input: z.unknown(),
  }) }),
  z.object({ ...Base, kind: z.literal("tool_result"), payload: z.looseObject({
    tool_use_id: z.string(),
    is_error: z.boolean(),
    preview: z.string(), // first ~300 chars of the result; the full text stays in the agent, not in our table
  }) }),
  z.object({ ...Base, kind: z.literal("plan"), payload: Plan }), // the whole plan after every plan-tool call: the last one is the current state
  z.object({ ...Base, kind: z.literal("finished"), payload: z.looseObject({
    subtype: z.string(), // success | error_max_turns | error_max_budget_usd | error_during_execution
    is_error: z.boolean(),
    num_turns: z.number(),
    duration_ms: z.number(),
    total_cost_usd: z.number(),
    result: z.string(), // the agent's final report
  }) }),
]);
export type RunEvent = z.infer<typeof RunEvent>;
export type RunEventKind = RunEvent["kind"];

export const FileMeta = z.object({ name: z.string(), mime: z.string(), bytes: z.number().int() });
export type FileMeta = z.infer<typeof FileMeta>;

export const Run = z.object({
  id: z.string(),
  prompt: z.string(),
  status: RunStatus,
  model: z.string(),
  connectionIds: z.array(z.string()), // the connections enabled when the run started; the agent got exactly these
  report: z.string().nullable(), // the agent's final text: what it did and what it could not do
  error: z.string().nullable(),
  numTurns: z.number().nullable(),
  durationMs: z.number().nullable(),
  costUsd: z.number().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type Run = z.infer<typeof Run>;

// The key state, derived from the run and its events by pure code. Nothing here is stored: it can be
// recomputed at any point of the run, which is what "derive the key state at every point" asks for.
export const RunState = z.object({
  status: RunStatus,
  turn: z.number().int(),
  maxTurns: z.number().int(),
  plan: Plan.nullable(),
  currentStep: PlanStep.nullable(),
  lastTool: z.object({ name: z.string(), summary: z.string(), viaConnection: z.string().nullable() }).nullable(),
  toolsUsed: z.array(z.string()),
  connections: z.array(z.object({ name: z.string(), status: z.string(), used: z.boolean() })),
  files: z.array(z.string()),
  costUsd: z.number().nullable(),
  durationMs: z.number().nullable(),
  error: z.string().nullable(),
});
export type RunState = z.infer<typeof RunState>;

export type DeriveState = (run: Run, events: RunEvent[]) => RunState;
export type ListRuns = () => Promise<Run[]>;
export type GetRun = (id: string) => Promise<{ run: Run; events: RunEvent[]; files: FileMeta[]; verdict: Verdict | null } | null>;
export type GetFile = (runId: string, name: string) => Promise<{ meta: FileMeta; content: string } | null>;

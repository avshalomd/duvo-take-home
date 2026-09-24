import { z } from "zod";
import type { Verdict } from "./eval"; // type-only: no runtime cycle with eval.ts, which imports Plan from here

// A run is one automation: one set of instructions in, a trace of events, a report and files out.
export const RunStatus = z.enum(["queued", "running", "evaluating", "succeeded", "failed", "cancelled"]); // cancelled: the user pressed Stop

// Why the run exists: typed free text, an automation's example while it is being tested, a saved automation called
// by its command, a schedule, or a follow-up ("ask for a change") on an earlier run.
export const RunPurpose = z.enum(["adhoc", "trial", "automation", "schedule", "followup"]);
export type RunPurpose = z.infer<typeof RunPurpose>;
export type RunStatus = z.infer<typeof RunStatus>;

// The agent's own plan, kept up to date through the plan tool. The key state of a run is read from here.
// What the agent may set a step to with the plan tool.
export const AgentStepStatus = z.enum(["pending", "running", "done", "skipped"]);
// A stored step can also be "unmarked" (qa-ai F8): the agent ended successfully without ticking it, so code marked it.
// A quiet state of its own - not "not started", which a finished run's step is not - and never the agent's to claim.
export const PlanStepStatus = z.enum(["pending", "running", "done", "skipped", "unmarked"]);
export const PlanStep = z.object({
  index: z.number().int().min(0),
  title: z.string().min(1),
  status: PlanStepStatus,
  note: z.string().optional(), // what happened on this step, in the agent's words ("no results, tried RSS")
});
// A fix attempt's own step (qa-ai F14, the owner's call): the plan stays as the first attempt left it, and each fix
// is a step after it, titled by the agent with what it changed. Optional, so plans stored before it still parse.
export const PlanFix = z.object({
  attempt: z.number().int().min(1),
  title: z.string().min(1),
  note: z.string().optional(),
});
// The agent's reading of the instructions comes first (his call, T+24): free text in, no presets, so the agent
// states what it understood before it acts, and the user can see a wrong reading before the work is done.
export const Plan = z.object({
  intent: z.string().default(""), // what the user wants, in one line
  expectedOutputs: z.array(z.string()).default([]), // e.g. ["output.csv with title,url,date", "a short report"]
  sources: z.array(z.string()).default([]), // which abilities and connections it will use: "web search", "GitHub"
  steps: z.array(PlanStep),
  fixes: z.array(PlanFix).optional(),
});
export type PlanStep = z.infer<typeof PlanStep>;
export type PlanFix = z.infer<typeof PlanFix>;
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
  // v2: a guard's decision on a tool call (blocked and flagged ones are shown; allowed ones only in Details)
  z.object({ ...Base, kind: z.literal("guard"), payload: z.looseObject({
    guard: z.enum(["path", "url", "write", "connection"]),
    tool: z.string(),
    decision: z.enum(["allowed", "blocked", "flagged", "unchecked"]), // unchecked: the decision model was unavailable, so it was let through
    reason: z.string(),
    target: z.string().optional(), // the path, host or connection the call was about
  }) }),
  // v2: auto-heal - the evaluator failed the result and the agent is fixing it (attempt n of max), with what it was told
  z.object({ ...Base, kind: z.literal("heal"), payload: z.looseObject({
    attempt: z.number().int().min(1),
    max: z.number().int().min(1),
    reasons: z.array(z.string()), // the verdict's reasons in plain words, as shown under "Why?"
    feedback: z.string(), // the exact instructions the agent was given
    stopped: z.string().optional(), // set when healing stopped instead of trying again ("the fix undid an earlier one")
  }) }),
  // v2: the per-step check - Jev's reading of whether a finished step did what its title says
  z.object({ ...Base, kind: z.literal("check"), payload: z.looseObject({
    stepIndex: z.number().int().min(0),
    onTrack: z.number().min(0).max(1),
    note: z.string(),
  }) }),
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

// What the output scan found in a file: credentials quarantine it; personal data is only counted and shown.
export const FileFlag = z.object({
  kind: z.enum(["credential", "email", "phone", "card", "iban"]),
  count: z.number().int().min(1),
  detail: z.string(), // "3 email addresses", "an API key on line 4"
});
export type FileFlag = z.infer<typeof FileFlag>;

export const FileMeta = z.object({
  name: z.string(),
  mime: z.string(),
  bytes: z.number().int(),
  encoding: z.enum(["utf8", "base64"]).optional(), // base64 for a binary output (.xlsx); absent means utf8
  flags: z.array(FileFlag).optional(),
  quarantined: z.boolean().optional(),
});
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
  // The verdict's headline, so a run row can say "Done, with notes" like the panel; the full Verdict is on GetRun.
  outcome: z.enum(["pass", "pass_with_notes", "fail", "unknown", "cannot_do", "needs_answer"]).nullable().optional(), // VerdictKind (eval.ts imports this file)
  // v2, optional so v1 rows and fixtures still parse
  workspaceId: z.string().nullable().optional(),
  purpose: RunPurpose.optional(),
  automationId: z.string().nullable().optional(),
  automationVersion: z.number().int().nullable().optional(),
  input: z.string().nullable().optional(), // the text after the command
  parentRunId: z.string().nullable().optional(),
  cancelRequested: z.boolean().optional(),
  humanVerdict: z.enum(["approved", "rejected"]).nullable().optional(), // the person's own judgment
  humanVerdictBy: z.string().nullable().optional(), // who judged it (a user id); null on rows from before it was stored
  humanNote: z.string().nullable().optional(),
  healAttempts: z.number().int().optional(), // how many times the run fixed its own result after a failing verdict
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
  // v2: the per-step checks by step index (the latest per step), and the guard decisions that were not "allowed"
  stepChecks: z.array(z.object({ stepIndex: z.number().int(), onTrack: z.number(), note: z.string() })).optional(),
  guards: z.array(z.object({ guard: z.string(), decision: z.string(), reason: z.string(), target: z.string().optional() })).optional(),
  heals: z.array(z.object({ attempt: z.number().int(), max: z.number().int(), reasons: z.array(z.string()) })).optional(), // auto-heal attempts, in order
});
export type RunState = z.infer<typeof RunState>;

export type DeriveState = (run: Run, events: RunEvent[]) => RunState;
// Every read takes the workspace id first. It comes from the session on the server, never from the client.
export type ListRuns = (workspaceId: string) => Promise<Run[]>;
export type GetRun = (workspaceId: string, id: string) => Promise<{ run: Run; events: RunEvent[]; files: FileMeta[]; verdict: Verdict | null } | null>;
export type GetFile = (workspaceId: string, runId: string, name: string) => Promise<{ meta: FileMeta; content: string } | null>;

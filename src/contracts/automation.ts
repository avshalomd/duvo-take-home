import { z } from "zod";
import { RunStatus } from "./run";

// A saved automation (his flow, 2026-09-23): a normal run -> "Make an automation" -> an LLM drafts the template from
// the run -> the user edits it -> runs one or two examples and judges them -> approves -> it is callable as
// "/<command> <input>" (a front slash, as in coding agents - his call, 2026-09-23). No free-form "skills": behaviour a user adds reaches the agent only through a template that
// was tested on examples and approved by a person, and any edit to it needs a new approved example.

export const CommandName = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9-]{1,23}$/, "Use 2-24 lower-case letters, digits or -, starting with a letter");

// The template: what the agent is told and what it must produce. {input} marks where the command's input goes.
export const AutomationTemplate = z.object({
  instructions: z
    .string()
    .trim()
    .min(10, "Say what the agent should do")
    .max(4000, "Keep the instructions under 4000 characters")
    .refine((s) => s.includes("{input}"), "Put {input} where the input goes"),
  intent: z.string().default(""), // one line: what this automation is for
  expectedOutputs: z.array(z.string().trim().min(1)).min(1, "Name at least one output"), // "audit.md with sections Ownership, Filings, News, Risks"
  outputFormat: z.string().default(""), // CSV columns, report headings: what "the same output every time" means
  steps: z.array(z.string().trim().min(1)).min(1, "Give at least one step").max(12, "Keep it to 12 steps"),
  connections: z.array(z.string()).default([]), // connection names that must be on, or the run refuses to start
});
export type AutomationTemplate = z.infer<typeof AutomationTemplate>;

export const AutomationStatus = z.enum(["draft", "active", "disabled"]);
export type AutomationStatus = z.infer<typeof AutomationStatus>;

export const Automation = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  command: z.string(),
  description: z.string(),
  inputLabel: z.string(), // "Company name"
  inputHint: z.string(), // "The company's registered name, e.g. Apple Inc."
  inputExample: z.string(), // the value the source run used ("Acme Ltd"), offered as the first example
  template: AutomationTemplate,
  status: AutomationStatus,
  version: z.number().int(), // bumped by every edit of the template; trials of older versions no longer count
  createdFromRunId: z.string().nullable(),
  approvedAt: z.string().nullable(),
  schedule: z.string().nullable(), // cron; null = on demand only
  scheduleInput: z.string().nullable(),
  nextRunAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Automation = z.infer<typeof Automation>;

// The LLM's output when it drafts an automation from a run (the seam between the model and the editor).
export const AutomationDraft = z.object({
  name: z.string().min(1).max(60), // "Company audit"
  command: z.string().min(2).max(24), // "audit" - normalised with CommandName before it is stored
  description: z.string().max(200),
  inputLabel: z.string().min(1).max(40),
  inputHint: z.string().max(120),
  inputExample: z.string(), // the value the source run used ("Acme Ltd"), offered as the first example
  template: AutomationTemplate,
});
export type AutomationDraft = z.infer<typeof AutomationDraft>;

// What the editor form submits. Arrays arrive as one item per line.
export const AutomationEdit = z.object({
  name: z.string().trim().min(1, "Give it a name").max(60),
  command: CommandName,
  description: z.string().trim().max(200).default(""),
  inputLabel: z.string().trim().min(1, "Name the input").max(40),
  inputHint: z.string().trim().max(120).default(""),
  inputExample: z.string().trim().max(200).default(""),
  template: AutomationTemplate,
});
export type AutomationEdit = z.infer<typeof AutomationEdit>;

// One example run of an automation while it is being tested, with the evaluator's outcome and the person's judgment.
export const Trial = z.object({
  runId: z.string(),
  input: z.string(),
  version: z.number().int(),
  status: RunStatus,
  outcome: z.enum(["pass", "pass_with_notes", "fail", "unknown"]).nullable(),
  humanVerdict: z.enum(["approved", "rejected"]).nullable(),
  humanNote: z.string().nullable(),
  createdAt: z.string(),
});
export type Trial = z.infer<typeof Trial>;

export const ParsedCommand = z.object({ command: z.string(), input: z.string() });
export type ParsedCommand = z.infer<typeof ParsedCommand>;

export const HumanVerdictInput = z.object({
  runId: z.uuid(),
  verdict: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).optional(),
});
export type HumanVerdictInput = z.infer<typeof HumanVerdictInput>;

type Ctx = { workspaceId: string; userId: string };

/** "/audit Apple Inc." -> { command: "audit", input: "Apple Inc." }; plain text -> null. Only the front slash. */
export type ParseCommand = (text: string) => ParsedCommand | null;
/** extract(): generalises a finished run into a draft the user edits. */
export type DraftAutomation = (run: {
  prompt: string;
  plan: unknown;
  report: string | null;
  files: { name: string; content: string }[];
}) => Promise<AutomationDraft>;
/** The prompt for one run of an automation, and the lines added to the system prompt so the agent keeps to it. */
export type FillTemplate = (a: Pick<Automation, "name" | "inputLabel" | "template">, input: string) => {
  prompt: string;
  systemAddendum: string;
};
/** Approval needs one approved example of the current version and no rejected one; the reason says what is missing. */
export type CanApprove = (trials: Trial[], version: number) => { ok: true } | { ok: false; reason: string };

export type ListAutomations = (workspaceId: string) => Promise<Automation[]>;
export type GetAutomation = (workspaceId: string, id: string) => Promise<Automation | null>;
export type GetActiveByCommand = (workspaceId: string, command: string) => Promise<Automation | null>;
export type CreateAutomationDraft = (ctx: Ctx, draft: AutomationDraft, fromRunId: string | null) => Promise<Automation>;
export type UpdateAutomation = (workspaceId: string, id: string, edit: AutomationEdit) => Promise<Automation>;
export type ApproveAutomation = (workspaceId: string, id: string) => Promise<Automation>;
export type DeleteAutomation = (workspaceId: string, id: string) => Promise<void>; // a bad draft needs a way out
export type SetAutomationStatus = (workspaceId: string, id: string, status: AutomationStatus) => Promise<void>;
export type SetSchedule = (workspaceId: string, id: string, schedule: string | null, input: string | null) => Promise<void>;
export type ListTrials = (workspaceId: string, automationId: string) => Promise<Trial[]>;
export type SetHumanVerdict = (workspaceId: string, input: HumanVerdictInput) => Promise<void>;
export type StartTrial = (ctx: Ctx, automationId: string, input: string) => Promise<{ id: string }>;
export type RunCommand = (ctx: Ctx, parsed: ParsedCommand) => Promise<{ id: string }>;

import "server-only";
import { and, desc, eq, gte, like, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { automations, runs } from "@/db/schema";
import {
  AutomationStatus,
  AutomationTemplate,
  HumanVerdictInput,
  type ApproveAutomation,
  type Automation,
  type AutomationEdit,
  type CreateAutomationDraft,
  type GetActiveByCommand,
  type GetAutomation,
  type ListAutomations,
  type ListTrials,
  type RunCommand,
  type SetAutomationStatus,
  type SetHumanVerdict,
  type SetSchedule,
  type StartTrial,
  type Trial,
  type UpdateAutomation,
} from "@/contracts/automation";
import { RunStatus } from "@/contracts/run";
import { listConnections } from "@/lib/connections/store";
import { startRun } from "@/lib/runs/start";
import { MAX_COMMAND_INPUT, nextFreeCommand, toCommandName } from "./command";
import { missingConnections } from "./connections";
import { AutomationError } from "./errors";
import { APPROVED_COMMAND_LOCKED } from "./permissions";
import { outcomeOf } from "./outcome";
import { nextRunAt } from "./schedule";
import { canApprove, changesThePrompt, fillTemplate } from "./template";

// Tenancy: every function takes the workspace id first (from the session, never from the client) and filters on it,
// so an automation or a run of another workspace reads as "not found".

type Row = typeof automations.$inferSelect;

// A non-uuid id would make Postgres throw instead of answering "no such row".
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const iso = (d: Date | null) => (d ? d.toISOString() : null);

function toAutomation(row: Row): Automation {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    command: row.command,
    description: row.description,
    inputLabel: row.inputLabel,
    inputHint: row.inputHint,
    inputExample: row.inputExample,
    template: AutomationTemplate.parse(row.template), // jsonb is typed only at compile time; this store is its only writer, always after the same check
    status: AutomationStatus.catch("draft").parse(row.status), // an unknown status reads as draft: never callable by accident
    version: row.version,
    createdFromRunId: row.createdFromRunId,
    approvedAt: iso(row.approvedAt),
    schedule: row.schedule,
    scheduleInput: row.scheduleInput,
    scheduleTz: row.scheduleTz,
    nextRunAt: iso(row.nextRunAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const inWorkspace = (workspaceId: string, id: string) => and(eq(automations.id, id), eq(automations.workspaceId, workspaceId));

async function mustGet(workspaceId: string, id: string): Promise<Automation> {
  const a = await getAutomation(workspaceId, id);
  if (!a) throw new AutomationError("That automation no longer exists.");
  return a;
}

export const listAutomations: ListAutomations = async (workspaceId) => {
  const rows = await db.select().from(automations).where(eq(automations.workspaceId, workspaceId)).orderBy(desc(automations.createdAt));
  // one row whose template does not parse (written by a script, an older shape) is left out, not the whole page
  return rows.flatMap((row) => {
    try {
      return [toAutomation(row)];
    } catch (e) {
      console.error(`automation ${row.id} does not parse`, e);
      return [];
    }
  });
};

export const getAutomation: GetAutomation = async (workspaceId, id) => {
  if (!isUuid(id)) return null;
  const [row] = await db.select().from(automations).where(inWorkspace(workspaceId, id));
  return row ? toAutomation(row) : null;
};

async function getByCommand(workspaceId: string, command: string): Promise<Automation | null> {
  const [row] = await db
    .select()
    .from(automations)
    .where(and(eq(automations.workspaceId, workspaceId), eq(automations.command, command.toLowerCase())));
  return row ? toAutomation(row) : null;
}

/** Only an approved, switched-on automation answers to its command. */
export const getActiveByCommand: GetActiveByCommand = async (workspaceId, command) => {
  const a = await getByCommand(workspaceId, command);
  return a?.status === "active" ? a : null;
};

/** A draft made from this run since `since`, if there is one: the same press seen twice (a reload while drafting, Q119). */
export async function recentDraftFromRun(workspaceId: string, runId: string, since: Date): Promise<Automation | null> {
  const [row] = await db
    .select()
    .from(automations)
    .where(
      and(
        eq(automations.workspaceId, workspaceId),
        eq(automations.createdFromRunId, runId),
        eq(automations.status, "draft"),
        gte(automations.createdAt, since),
      ),
    )
    .orderBy(desc(automations.createdAt))
    .limit(1);
  return row ? toAutomation(row) : null;
}

/**
 * Stores the model's draft as an automation in status draft, version 1. The command is normalised and, when the
 * workspace already has it, numbered "-2", "-3": a draft must never fail on the unique index the user cannot see.
 */
export const createAutomationDraft: CreateAutomationDraft = async (ctx, draft, fromRunId) => {
  const base = toCommandName(draft.command);
  const taken = await db
    .select({ command: automations.command })
    .from(automations)
    .where(and(eq(automations.workspaceId, ctx.workspaceId), like(automations.command, `${base}%`)));
  const description = draft.description.trim() || draft.template.intent;
  const [row] = await db
    .insert(automations)
    .values({
      workspaceId: ctx.workspaceId,
      createdBy: ctx.userId,
      name: draft.name.trim(),
      command: nextFreeCommand(base, taken.map((t) => t.command)),
      description,
      inputLabel: draft.inputLabel.trim(),
      inputHint: draft.inputHint.trim(),
      inputExample: draft.inputExample.trim(),
      template: AutomationTemplate.parse({ ...draft.template, intent: description }), // one sentence for the card and the judge
      status: "draft",
      version: 1,
      createdFromRunId: fromRunId,
    })
    .returning();
  return toAutomation(row);
};

/**
 * Saves the editor. An edit that changes what the agent is told bumps the version and sends the automation back to
 * draft, so its earlier examples stop counting and it needs a new approved one (his rule).
 *
 * `mayRenameApproved`: whether the caller may change an approved automation's command (an owner or an admin, Q178).
 * When they may not and the command changes, the write itself only matches a draft (review R2): an approval landing
 * between the caller's check and this save then refuses the rename instead of letting it through. Not said: refused.
 */
export const updateAutomation = (async (workspaceId: string, id: string, edit: AutomationEdit, { mayRenameApproved = false } = {}) => {
  const current = await mustGet(workspaceId, id);
  const renames = edit.command !== current.command;
  if (renames) {
    const [clash] = await db
      .select({ name: automations.name })
      .from(automations)
      .where(and(eq(automations.workspaceId, workspaceId), eq(automations.command, edit.command), ne(automations.id, id)));
    if (clash) throw new AutomationError(`/${edit.command} is already used by "${clash.name}". Pick another command.`);
  }
  const onlyADraft = renames && !mayRenameApproved;
  const bump = changesThePrompt(current, edit);
  const [row] = await db
    .update(automations)
    .set({
      name: edit.name,
      command: edit.command,
      description: edit.description,
      inputLabel: edit.inputLabel,
      inputHint: edit.inputHint,
      inputExample: edit.inputExample,
      template: edit.template,
      ...(bump ? { version: sql`${automations.version} + 1`, status: "draft", approvedAt: null } : {}),
      updatedAt: new Date(),
    })
    // status as it is before this write: an edit that sends it back to draft does not open the rename
    .where(and(inWorkspace(workspaceId, id), onlyADraft ? eq(automations.status, "draft") : undefined))
    .returning();
  if (!row) {
    await mustGet(workspaceId, id); // deleted meanwhile: say that, not the rename rule
    throw new AutomationError(APPROVED_COMMAND_LOCKED);
  }
  return toAutomation(row);
}) satisfies UpdateAutomation;

export const approveAutomation: ApproveAutomation = async (workspaceId, id) => {
  const a = await mustGet(workspaceId, id);
  const check = canApprove(await listTrials(workspaceId, id), a.version);
  if (!check.ok) throw new AutomationError(check.reason);
  const [row] = await db
    .update(automations)
    .set({ status: "active", approvedAt: new Date(), updatedAt: new Date() })
    // the version it was checked at: an edit saved in between bumps it, and this approval then matches nothing
    .where(and(inWorkspace(workspaceId, id), eq(automations.version, a.version)))
    .returning();
  if (!row) throw new AutomationError("The automation changed while you were approving it. Check its examples again.");
  return toAutomation(row);
};

/** Turn off and on again. Only an approved version can be on: an edit clears approvedAt, so it cannot slip back. */
export const setAutomationStatus: SetAutomationStatus = async (workspaceId, id, status) => {
  const a = await mustGet(workspaceId, id);
  if (status === "active" && !a.approvedAt) throw new AutomationError("Approve it first: run an example and mark it as looks right.");
  await db.update(automations).set({ status, updatedAt: new Date() }).where(inWorkspace(workspaceId, id));
};

/**
 * A cron, the zone it is read in (the browser's IANA zone, so 08:00 stays 08:00 across a clock change) and the input
 * each scheduled run gets; null clears all three. next_run_at is computed here, in that zone.
 */
export const setSchedule: SetSchedule = async (workspaceId, id, schedule, input, tz) => {
  await mustGet(workspaceId, id);
  const cron = schedule?.trim() || null;
  await db
    .update(automations)
    .set({
      schedule: cron,
      scheduleInput: cron ? input?.trim() || null : null,
      scheduleTz: cron ? tz || null : null,
      nextRunAt: cron ? nextRunAt(cron, new Date(), tz) : null, // throws a readable AutomationError for a bad zone or cron, or one too frequent
      updatedAt: new Date(),
    })
    .where(inWorkspace(workspaceId, id));
};

/** An automation's examples: its runs with purpose "trial", newest first, with the version each one ran. */
export const listTrials: ListTrials = async (workspaceId, automationId) => {
  if (!isUuid(automationId)) return [];
  const rows = await db
    .select()
    .from(runs)
    .where(and(eq(runs.workspaceId, workspaceId), eq(runs.automationId, automationId), eq(runs.purpose, "trial")))
    .orderBy(desc(runs.createdAt));
  return rows.map(
    (r): Trial => ({
      runId: r.id,
      input: r.input ?? "",
      version: r.automationVersion ?? 0,
      status: RunStatus.catch("failed").parse(r.status),
      outcome: outcomeOf(r.verdict),
      humanVerdict: r.humanVerdict === "approved" || r.humanVerdict === "rejected" ? r.humanVerdict : null,
      humanVerdictBy: r.humanVerdictBy,
      humanNote: r.humanNote,
      createdAt: r.createdAt.toISOString(),
    }),
  );
};

const FINISHED = ["succeeded", "failed", "cancelled"];

/**
 * The person's judgment of a finished run, with who made it (the page says "You said" only to them). "Looks right"
 * needs a run that succeeded; "not right" fits any ending. A second judgment replaces the first, judge included.
 */
export const setHumanVerdict: SetHumanVerdict = async ({ workspaceId, userId }, input) => {
  const { runId, verdict, note } = HumanVerdictInput.parse(input);
  const [run] = await db.select({ status: runs.status }).from(runs).where(and(eq(runs.id, runId), eq(runs.workspaceId, workspaceId)));
  if (!run) throw new AutomationError("That run was not found.");
  if (!FINISHED.includes(run.status)) throw new AutomationError("This example is still running. Judge it when it has finished.");
  if (verdict === "approved" && run.status !== "succeeded") throw new AutomationError("This example failed, so it cannot be marked as looks right.");
  await db
    .update(runs)
    .set({ humanVerdict: verdict, humanVerdictBy: userId, humanNote: note || null, reviewedAt: new Date() })
    .where(and(eq(runs.id, runId), eq(runs.workspaceId, workspaceId)));
};

/** "Turn on DeepWiki in Settings to run /audit": a run without a connection its template needs would only fail later. */
async function refuseMissingConnections(workspaceId: string, a: Automation, what: string) {
  const missing = missingConnections(a.template.connections, await listConnections(workspaceId));
  if (missing.length) throw new AutomationError(`Turn on ${missing.join(" and ")} in Settings to run ${what}`);
}

/** One example of the current version: a real run with the template filled, marked purpose "trial". */
export const startTrial: StartTrial = async (ctx, automationId, rawInput) => {
  const a = await mustGet(ctx.workspaceId, automationId);
  const input = rawInput.trim();
  if (!input) throw new AutomationError(`Type an example ${a.inputLabel.toLowerCase()} first.`);
  await refuseMissingConnections(ctx.workspaceId, a, "this example");
  return startRun(ctx, {
    prompt: fillTemplate(a, input).prompt,
    purpose: "trial",
    automationId: a.id,
    automationVersion: a.version,
    input,
  });
};

/** "/audit Apple Inc." from the Home box or the Run box: only an approved, switched-on automation runs. */
export const runCommand: RunCommand = async (ctx, parsed) => {
  const command = parsed.command.toLowerCase();
  const a = await getActiveByCommand(ctx.workspaceId, command);
  if (!a) {
    const any = await getByCommand(ctx.workspaceId, command);
    if (!any) throw new AutomationError(`There is no automation called /${command}. The Automations page lists the ones you have.`);
    if (any.status === "draft") throw new AutomationError(`/${command} is not approved yet. Open it on the Automations page, try an example and approve it.`);
    throw new AutomationError(`/${command} is turned off. Turn it on from its page under Automations.`);
  }
  const input = parsed.input.trim();
  if (!input) throw new AutomationError(`Add the ${a.inputLabel.toLowerCase()} after the command, e.g. /${command} ${a.inputExample || "..."}`);
  if (input.length > MAX_COMMAND_INPUT) throw new AutomationError(`Keep the ${a.inputLabel.toLowerCase()} under ${MAX_COMMAND_INPUT} characters.`);
  await refuseMissingConnections(ctx.workspaceId, a, `/${command}`);
  return startRun(ctx, {
    prompt: fillTemplate(a, input).prompt,
    purpose: "automation",
    automationId: a.id,
    automationVersion: a.version,
    input,
  });
};

/** Removes the automation. Its runs stay in the history; their automation id then points at nothing, which reads as a plain run. */
export async function deleteAutomation(workspaceId: string, id: string): Promise<void> {
  if (!isUuid(id)) return;
  await db.delete(automations).where(inWorkspace(workspaceId, id));
}

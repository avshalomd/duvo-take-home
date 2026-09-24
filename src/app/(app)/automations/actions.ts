"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { readError } from "@/lib/automations/errors";
import type { EditValues } from "@/lib/automations/form";
import { parseEditForm } from "@/lib/automations/form";
import { MAX_COMMAND_INPUT } from "@/lib/automations/command";
import { draftFromRun } from "@/lib/automations/from-run";
import { canGovernAutomations, commandRefusal, hasBeenApproved, refusalFor } from "@/lib/automations/permissions";
import { choiceToCron } from "@/lib/automations/schedule-local";
import { isTimeZone } from "@/lib/automations/schedule";
import {
  approveAutomation,
  deleteAutomation,
  getAutomation,
  listTrials,
  runCommand,
  setAutomationStatus,
  setHumanVerdict,
  setSchedule,
  startTrial,
  updateAutomation,
} from "@/lib/automations/store";

// Every write of the builder. Each action validates its fields with Zod, takes the workspace from the session (never
// from the form), and returns a state instead of throwing, so a refusal reaches the person as a sentence. Approve,
// turn off or on, delete and schedule check the role first (Q178, lib/automations/permissions.ts): the page shows a
// member plain lines instead of those controls, but anyone can post to an action.

export type ActionState = { ok?: boolean; message?: string; error?: string; values?: Record<string, string> };
export type EditState = { ok?: boolean; message?: string; error?: string; fieldErrors?: Record<string, string>; values?: EditValues };

const Id = z.uuid();
const field = (formData: FormData, key: string) => String(formData.get(key) ?? "");

async function ctx() {
  const s = await requireSession();
  return { workspaceId: s.workspaceId, userId: s.userId };
}

async function role() {
  return (await requireSession()).role; // requireSession is cached per request: this is not a second lookup
}

function refresh(id?: string) {
  revalidatePath("/automations");
  if (id) revalidatePath(`/automations/${id}`);
}

/** Called by the drafting page once it is on screen: a GET never spends a model call, so a prefetch cannot either. */
export async function draftFromRunAction(runId: string): Promise<{ id?: string; error?: string }> {
  const id = Id.safeParse(runId);
  if (!id.success) return { error: "Pick a run to start from." };
  try {
    const automation = await draftFromRun(await ctx(), id.data);
    refresh();
    return { id: automation.id };
  } catch (e) {
    return { error: readError(e) };
  }
}

export async function saveAutomationAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const id = Id.safeParse(field(formData, "id"));
  if (!id.success) return { error: "That automation no longer exists." };
  const parsed = parseEditForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values: parsed.values };

  const { workspaceId } = await ctx();
  // Q178: a member renames a draft's command, not one approved before: people call it by that name
  const current = await getAutomation(workspaceId, id.data);
  if (current && current.command !== parsed.edit.command) {
    const approvedBefore = hasBeenApproved(current.status, current.version, await listTrials(workspaceId, id.data));
    const refused = commandRefusal(await role(), approvedBefore);
    if (refused) return { error: refused, values: parsed.values };
  }
  try {
    // the store's write holds the rule again: an approval can land between the check above and this save (review R2)
    const saved = await updateAutomation(workspaceId, id.data, parsed.edit, { mayRenameApproved: canGovernAutomations(await role()) });
    refresh(id.data);
    const bumped = saved.version !== Number(field(formData, "version")); // the version the form was rendered with
    // a member cannot approve (Q178), so their next step names who does
    const next = refusalFor(await role(), "approve") ? ", then an owner or an admin approves it." : " before you approve.";
    return { ok: true, message: bumped ? `Saved. This is version ${saved.version} now: run an example of it${next}` : "Saved." };
  } catch (e) {
    return { error: readError(e), values: parsed.values };
  }
}

// An example's input and a Run's input: the same limit as a command's (Q197). An empty one is the store's to refuse,
// in words that name what the input is.
const RunInput = z.object({ id: Id, input: z.string().trim().max(MAX_COMMAND_INPUT, `Keep the input under ${MAX_COMMAND_INPUT} characters.`) });

function parseRunInput(formData: FormData): { ok: true; id: string; input: string } | { ok: false; state: ActionState } {
  const typed = field(formData, "input");
  const parsed = RunInput.safeParse({ id: field(formData, "id"), input: typed });
  if (parsed.success) return { ok: true, ...parsed.data };
  const issue = parsed.error.issues[0];
  if (issue?.path[0] === "id") return { ok: false, state: { error: "That automation no longer exists." } };
  return { ok: false, state: { error: issue?.message ?? "Check the input.", values: { input: typed } } };
}

export async function startTrialAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseRunInput(formData);
  if (!parsed.ok) return parsed.state;
  const { id, input } = parsed;
  try {
    await startTrial(await ctx(), id, input);
  } catch (e) {
    return { error: readError(e), values: { input } };
  }
  refresh(id);
  return { ok: true };
}

const Verdict = z.object({
  automationId: Id,
  runId: Id,
  verdict: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500, "Keep the note under 500 characters").optional(),
});

export async function setVerdictAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = Verdict.safeParse({
    automationId: field(formData, "automationId"),
    runId: field(formData, "runId"),
    verdict: field(formData, "verdict"),
    note: field(formData, "note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Choose looks right or not right." };
  try {
    // who judged is the session's user, never a field of the form
    await setHumanVerdict(await ctx(), { runId: parsed.data.runId, verdict: parsed.data.verdict, note: parsed.data.note });
  } catch (e) {
    return { error: readError(e) };
  }
  refresh(parsed.data.automationId);
  return { ok: true };
}

export async function approveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const refused = refusalFor(await role(), "approve");
  if (refused) return { error: refused };
  const id = Id.safeParse(field(formData, "id"));
  if (!id.success) return { error: "That automation no longer exists." };
  const { workspaceId } = await ctx();
  try {
    await approveAutomation(workspaceId, id.data);
  } catch (e) {
    return { error: readError(e) };
  }
  refresh(id.data);
  // the page turns into the ready page; ?approved=1 asks it for the small confirmation of this press
  redirect(`/automations/${id.data}?approved=1`);
}

export async function setStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const refused = refusalFor(await role(), "status");
  if (refused) return { error: refused };
  const id = Id.safeParse(field(formData, "id"));
  const status = z.enum(["active", "disabled"]).safeParse(field(formData, "status"));
  if (!id.success || !status.success) return { error: "That automation no longer exists." };
  const { workspaceId } = await ctx();
  try {
    await setAutomationStatus(workspaceId, id.data, status.data);
  } catch (e) {
    return { error: readError(e) };
  }
  refresh(id.data);
  return { ok: true };
}

const Schedule = z.object({
  id: Id,
  preset: z.enum(["none", "weekdays", "mondays", "daily", "custom"]),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a time of day"),
  tz: z.string().refine(isTimeZone, "Your browser sent a time zone we do not know. Reload the page and try again."), // the browser's IANA zone
  cron: z.string().trim().max(100),
  input: z.string().trim().max(2000),
});

/** The schedule as chosen, in the viewer's own time and zone (Q107): the cron keeps the local time, the zone goes beside it. */
export async function setScheduleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = { preset: field(formData, "preset"), time: field(formData, "time") || "08:00", cron: field(formData, "cron"), input: field(formData, "input") };
  const refused = refusalFor(await role(), "schedule");
  if (refused) return { error: refused, values };
  const parsed = Schedule.safeParse({ id: field(formData, "id"), tz: field(formData, "tz"), ...values });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Choose when it should run.", values };
  const { id, preset, time, tz, cron, input } = parsed.data;

  const chosen = preset === "none" ? null : preset === "custom" ? cron : choiceToCron({ repeat: preset, time });
  if (chosen === "") return { error: "Write the custom schedule as a cron expression, e.g. 0 8 * * 1-5.", values };
  if (chosen && !input) return { error: "Say which input the scheduled runs get.", values };

  const { workspaceId } = await ctx();
  try {
    await setSchedule(workspaceId, id, chosen, chosen ? input : null, chosen ? tz : null);
  } catch (e) {
    return { error: readError(e), values };
  }
  refresh(id);
  return { ok: true, message: chosen ? "Schedule saved." : "Schedule removed." };
}

/** "Run" on the automation's page: the same path as typing \command input on Home. */
export async function runNowAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseRunInput(formData);
  if (!parsed.ok) return parsed.state;
  const { id, input } = parsed;
  const session = await ctx();
  let runId: string;
  try {
    const a = await getAutomation(session.workspaceId, id);
    if (!a) return { error: "That automation no longer exists." };
    ({ id: runId } = await runCommand(session, { command: a.command, input }));
  } catch (e) {
    return { error: readError(e), values: { input } };
  }
  redirect(`/?run=${runId}`); // redirect throws its own signal: it stays outside the try
}

/** Returns a state only when it is refused; otherwise the page it deleted from is gone, so it goes to the gallery. */
export async function deleteAutomationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const refused = refusalFor(await role(), "delete");
  if (refused) return { error: refused };
  const id = Id.safeParse(field(formData, "id"));
  if (id.success) await deleteAutomation((await ctx()).workspaceId, id.data);
  refresh();
  redirect("/automations");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { readError } from "@/lib/automations/errors";
import type { EditValues } from "@/lib/automations/form";
import { parseEditForm } from "@/lib/automations/form";
import { draftFromRun } from "@/lib/automations/from-run";
import { choiceToCron } from "@/lib/automations/schedule-local";
import { isTimeZone } from "@/lib/automations/schedule";
import {
  approveAutomation,
  deleteAutomation,
  getAutomation,
  runCommand,
  setAutomationStatus,
  setHumanVerdict,
  setSchedule,
  startTrial,
  updateAutomation,
} from "@/lib/automations/store";

// Every write of the builder. Each action validates its fields with Zod, takes the workspace from the session (never
// from the form), and returns a state instead of throwing, so a refusal reaches the person as a sentence.

export type ActionState = { ok?: boolean; message?: string; error?: string; values?: Record<string, string> };
export type EditState = { ok?: boolean; message?: string; error?: string; fieldErrors?: Record<string, string>; values?: EditValues };

const Id = z.uuid();
const field = (formData: FormData, key: string) => String(formData.get(key) ?? "");

async function ctx() {
  const s = await requireSession();
  return { workspaceId: s.workspaceId, userId: s.userId };
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
  try {
    const saved = await updateAutomation(workspaceId, id.data, parsed.edit);
    refresh(id.data);
    const bumped = saved.version !== Number(field(formData, "version")); // the version the form was rendered with
    return {
      ok: true,
      message: bumped ? `Saved. This is version ${saved.version} now: run an example of it before you approve.` : "Saved.",
    };
  } catch (e) {
    return { error: readError(e), values: parsed.values };
  }
}

export async function startTrialAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = Id.safeParse(field(formData, "id"));
  if (!id.success) return { error: "That automation no longer exists." };
  const input = field(formData, "input");
  try {
    await startTrial(await ctx(), id.data, input);
  } catch (e) {
    return { error: readError(e), values: { input } };
  }
  refresh(id.data);
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
  const { workspaceId } = await ctx();
  try {
    await setHumanVerdict(workspaceId, { runId: parsed.data.runId, verdict: parsed.data.verdict, note: parsed.data.note });
  } catch (e) {
    return { error: readError(e) };
  }
  refresh(parsed.data.automationId);
  return { ok: true };
}

export async function approveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
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
  const id = Id.safeParse(field(formData, "id"));
  if (!id.success) return { error: "That automation no longer exists." };
  const input = field(formData, "input");
  const session = await ctx();
  let runId: string;
  try {
    const a = await getAutomation(session.workspaceId, id.data);
    if (!a) return { error: "That automation no longer exists." };
    ({ id: runId } = await runCommand(session, { command: a.command, input }));
  } catch (e) {
    return { error: readError(e), values: { input } };
  }
  redirect(`/?run=${runId}`); // redirect throws its own signal: it stays outside the try
}

export async function deleteAutomationAction(formData: FormData): Promise<void> {
  const id = Id.safeParse(field(formData, "id"));
  if (id.success) await deleteAutomation((await ctx()).workspaceId, id.data);
  refresh();
  redirect("/automations");
}

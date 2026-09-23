"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { FollowUpInput, StartRunInput } from "@/contracts/agent";
import { commandWord } from "@/components/run/command-query";
import { requireSession } from "@/lib/auth/session";
import { parseCommand } from "@/lib/automations/command";
import { getActiveByCommand, runCommand } from "@/lib/automations/store";
import { reevaluateRun } from "@/lib/eval/reevaluate";
import { cancelRun } from "@/lib/runs/cancel";
import { startFollowUp } from "@/lib/runs/follow-up";
import { getRun } from "@/lib/runs/queries";
import { startRun } from "@/lib/runs/start";
import { readable } from "./readable";

// Every action returns its state instead of throwing: some of what they call is still being built, and a
// "not implemented" must reach the user as an error state, not as a crashed page.
export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
};

const RunId = z.uuid(); // ids arrive from hidden fields, which are user input like any other

/**
 * The composer's one box: "/audit Acme Ltd" runs the saved automation (a front slash only), anything else is
 * instructions for a new run. The workspace always comes from the session, never from the form.
 */
export async function startRunAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { prompt: String(formData.get("prompt") ?? "") };
  const session = await requireSession();
  const ctx = { workspaceId: session.workspaceId, userId: session.userId };

  // A text that starts like a command is always treated as one: a mistyped command must never quietly become a
  // paid free-text run. parseCommand reads it; commandWord still names the command when it does not parse.
  const parsed = parseCommand(values.prompt.trim());
  const word = parsed?.command ?? commandWord(values.prompt);
  let id: string;
  if (word) {
    const unknown = { error: `There is no saved automation called /${word}. Type / to see the ones you have.`, values };
    if (!parsed) return unknown;
    try {
      // looked up here, not left to runCommand, so the refusal names the command in words the person typed
      if (!(await getActiveByCommand(session.workspaceId, parsed.command))) return unknown;
      ({ id } = await runCommand(ctx, parsed));
    } catch (e) {
      return { error: readable(e), values };
    }
  } else {
    const input = StartRunInput.safeParse(values);
    if (!input.success) return { fieldErrors: z.flattenError(input.error).fieldErrors, values };
    try {
      ({ id } = await startRun(ctx, { prompt: input.data.prompt }));
    } catch (e) {
      return { error: readable(e), values }; // keeps what was typed, so the instructions are not lost
    }
  }
  redirect(`/?run=${id}`); // redirect throws its own signal: it must stay outside the try
}

/** Stop: asks the runner to abort the run; it sees the request within two seconds and closes it as cancelled. */
export async function cancelRunAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const runId = RunId.safeParse(String(formData.get("runId") ?? ""));
  if (!runId.success) return { error: "No run selected" };

  const { workspaceId } = await requireSession();
  try {
    // cancelRun checks the workspace and the status itself, and refuses in words (CancelError): not found, finished
    await cancelRun(workspaceId, runId.data);
  } catch (e) {
    return { error: readable(e) };
  }
  revalidatePath("/");
  return {};
}

/** "Ask for a change" on a finished run: a new run that continues it, which the page then opens. */
export async function followUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { runId: String(formData.get("runId") ?? ""), prompt: String(formData.get("prompt") ?? "") };
  const input = FollowUpInput.safeParse(values);
  if (!input.success) return { fieldErrors: z.flattenError(input.error).fieldErrors, values };

  const session = await requireSession();
  let id: string;
  try {
    // startFollowUp checks the parent is this workspace's and finished, and refuses in words (FollowUpError)
    ({ id } = await startFollowUp({ workspaceId: session.workspaceId, userId: session.userId }, input.data));
  } catch (e) {
    return { error: readable(e), values };
  }
  redirect(`/?run=${id}`);
}

// The verdict is stored on the run, so re-evaluating is a write: a Server Action, not a client fetch.
export async function reevaluateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const runId = RunId.safeParse(String(formData.get("runId") ?? ""));
  if (!runId.success) return { error: "No run selected" };

  const { workspaceId } = await requireSession();
  const data = await getRun(workspaceId, runId.data); // the workspace check: another workspace's run reads as missing
  if (!data) return { error: "That run no longer exists" };
  // judging a run that is still working would evaluate half a result and overwrite it a minute later
  if (data.run.status !== "succeeded" && data.run.status !== "failed")
    return { error: "Only a run that has finished can be checked again" };

  try {
    await reevaluateRun(runId.data);
  } catch (e) {
    return { error: readable(e) };
  }
  revalidatePath("/");
  return {};
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { FollowUpInput, StartRunInput } from "@/contracts/agent";
import { leftWorkspaceRefusal, requireSession } from "@/lib/auth/session";
import { parseCommand } from "@/lib/automations/command";
import { runCommand } from "@/lib/automations/store";
import { reevaluateRun } from "@/lib/eval/reevaluate";
import { cancelRun } from "@/lib/runs/cancel";
import { startFollowUp } from "@/lib/runs/follow-up";
import { getRun } from "@/lib/runs/queries";
import { startRunAgain } from "@/lib/runs/run-again";
import { startRun } from "@/lib/runs/start";
import { readable } from "./readable";

// Every action returns its state instead of throwing: some of what they call is still being built, and a
// "not implemented" must reach the user as an error state, not as a crashed page.
export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
  startedId?: string; // the run a start created: the caller opens it (the composer hands the brief over to it)
};

const RunId = z.uuid(); // ids arrive from hidden fields, which are user input like any other

/**
 * The composer's one box: "/audit Acme Ltd" runs the saved automation (a front slash only), anything else is
 * instructions for a new run. The workspace always comes from the session, never from the form.
 *
 * It answers with the new run's id instead of redirecting: the composer navigates itself, inside the same React
 * transition that carries the brief from the box into the run's title (the one orchestrated moment).
 */
export async function startRunAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { prompt: String(formData.get("prompt") ?? "") };
  const session = await requireSession();
  const left = await leftWorkspaceRefusal(); // removed while this tab was open: no run in a workspace they are not looking at
  if (left) return { error: left, values };
  const ctx = { workspaceId: session.workspaceId, userId: session.userId };

  // A text that starts with "/" and a word is always a command (F14): a mistyped one must never quietly become a
  // paid free-text run.
  const parsed = parseCommand(values.prompt.trim());
  try {
    if (parsed) {
      // runCommand refuses in its own words - no such command, not approved yet, turned off, no input (Q116)
      const { id } = await runCommand(ctx, parsed);
      return { startedId: id };
    }
    const input = StartRunInput.safeParse(values);
    if (!input.success) return { fieldErrors: z.flattenError(input.error).fieldErrors, values };
    const { id } = await startRun(ctx, { prompt: input.data.prompt });
    return { startedId: id };
  } catch (e) {
    return { error: readable(e), values }; // keeps what was typed, so the instructions are not lost
  }
}

/**
 * "Run again": only the run's id comes from the browser. The brief is read from the run in the caller's workspace,
 * so a follow-up runs its whole thread again and a page cannot start a paid run of any text it likes.
 */
export async function runAgainAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const runId = RunId.safeParse(String(formData.get("runId") ?? ""));
  if (!runId.success) return { error: "No run selected" };

  const session = await requireSession();
  try {
    const started = await startRunAgain({ workspaceId: session.workspaceId, userId: session.userId }, runId.data);
    if (!started) return { error: "That run no longer exists" };
    return { startedId: started.id };
  } catch (e) {
    return { error: readable(e) }; // the day's limits, or a thread too long to run as one brief
  }
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
  // a stopped run has ended, but with nothing the judge could check (F19)
  if (data.run.status === "cancelled") return { error: "A stopped run has no result to check." };
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

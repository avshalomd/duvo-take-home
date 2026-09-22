"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { StartRunInput } from "@/contracts/agent";
import { NewConnection } from "@/contracts/connection";
import { addConnection, setConnectionEnabled } from "@/lib/connections/store";
import { reevaluateRun } from "@/lib/eval/reevaluate";
import { getRun } from "@/lib/runs/queries";
import { startRun } from "@/lib/runs/start";

// Every action returns its state instead of throwing: the engine and the store are still stubs, and a stub's
// "not implemented" must reach the user as an error state, not as a crashed page.
export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
};

function readable(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

export async function startRunAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { prompt: String(formData.get("prompt") ?? "") };
  const parsed = StartRunInput.safeParse(values);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

  let id: string;
  try {
    ({ id } = await startRun(parsed.data));
  } catch (e) {
    return { error: readable(e), values }; // keeps what was typed, so the instructions are not lost
  }
  redirect(`/?run=${id}`); // redirect throws its own signal: it must stay outside the try
}

// The verdict is stored on the run, so re-evaluating is a write: a Server Action, not a client fetch.
export async function reevaluateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // ids arrive from a hidden field, which is user input like any other: validated before it reaches the database
  const runId = z.uuid().safeParse(String(formData.get("runId") ?? ""));
  if (!runId.success) return { error: "No run selected" };

  const data = await getRun(runId.data);
  if (!data) return { error: "That run no longer exists" };
  // judging a run that is still working would evaluate half a result and overwrite it a minute later
  if (data.run.status !== "succeeded" && data.run.status !== "failed")
    return { error: "This run is still going - check it again when it finishes" };

  try {
    await reevaluateRun(runId.data);
  } catch (e) {
    return { error: readable(e) };
  }
  revalidatePath("/");
  return {};
}

export async function setConnectionEnabledAction(id: string, enabled: boolean): Promise<FormState> {
  const input = z.object({ id: z.uuid(), enabled: z.boolean() }).safeParse({ id, enabled });
  if (!input.success) return { error: "That connection could not be found" }; // a Server Action is a public endpoint: its arguments are validated too

  try {
    await setConnectionEnabled(input.data.id, input.data.enabled);
  } catch (e) {
    return { error: readable(e) };
  }
  revalidatePath("/");
  return {};
}

export async function addConnectionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = {
    name: String(formData.get("name") ?? ""),
    url: String(formData.get("url") ?? ""),
    transport: String(formData.get("transport") ?? "http"),
    token: String(formData.get("token") ?? ""),
  };
  const parsed = NewConnection.safeParse({ ...values, token: values.token || undefined });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

  try {
    await addConnection(parsed.data);
  } catch (e) {
    return { error: readable(e), values };
  }
  revalidatePath("/");
  return {};
}

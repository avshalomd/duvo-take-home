"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { StartRunInput } from "@/contracts/agent";
import { NewConnection } from "@/contracts/connection";
import { addConnection, setConnectionEnabled } from "@/lib/connections/store";
import { reevaluateRun } from "@/lib/eval/reevaluate";
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
  const runId = String(formData.get("runId") ?? "");
  if (!runId) return { error: "No run selected" };
  try {
    await reevaluateRun(runId);
  } catch (e) {
    return { error: readable(e) };
  }
  revalidatePath("/");
  return {};
}

export async function setConnectionEnabledAction(id: string, enabled: boolean): Promise<FormState> {
  try {
    await setConnectionEnabled(id, enabled);
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

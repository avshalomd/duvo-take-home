"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NewConnection } from "@/contracts/connection";
import { requireSession } from "@/lib/auth/session";
import { addConnection, setConnectionEnabled } from "@/lib/connections/store";
import { readable } from "../readable";
import type { FormState } from "../actions";

export async function setConnectionEnabledAction(id: string, enabled: boolean): Promise<FormState> {
  const input = z.object({ id: z.uuid(), enabled: z.boolean() }).safeParse({ id, enabled });
  if (!input.success) return { error: "That connection could not be found" }; // a Server Action is a public endpoint: its arguments are validated too

  const { workspaceId } = await requireSession();
  try {
    await setConnectionEnabled(workspaceId, input.data.id, input.data.enabled);
  } catch (e) {
    return { error: readable(e) };
  }
  revalidatePath("/settings/connections");
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

  const { workspaceId } = await requireSession();
  try {
    await addConnection(workspaceId, parsed.data);
  } catch (e) {
    return { error: readable(e), values };
  }
  revalidatePath("/settings/connections");
  return {};
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { InviteInput } from "@/contracts/auth";
import { inviteMember, listMembers } from "@/lib/auth/members";
import { requireSession } from "@/lib/auth/session";
import { addConnection, deleteConnection, setConnectionEnabled, updateConnection } from "@/lib/connections/store";
import { updateLimits } from "@/lib/usage/budget";
import type { FormState } from "../actions";
import { parseConnectionForm } from "./connection-form";
import { inviteError, settingsError } from "./errors";
import { parseLimitsForm } from "./limits-form";

// Every action returns its state instead of throwing, and takes the workspace from the session, never from the
// form: a Server Action is a public endpoint, so its arguments are validated like any other input.

const Id = z.uuid();

export async function setConnectionEnabledAction(id: string, enabled: boolean): Promise<FormState> {
  const input = z.object({ id: Id, enabled: z.boolean() }).safeParse({ id, enabled });
  if (!input.success) return { error: "That connection could not be found" };

  const { workspaceId } = await requireSession();
  try {
    await setConnectionEnabled(workspaceId, input.data.id, input.data.enabled);
  } catch (e) {
    return { error: settingsError(e) };
  }
  revalidatePath("/settings/connections");
  return {};
}

export async function addConnectionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseConnectionForm(formData, "add");
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values: parsed.values };

  const { workspaceId } = await requireSession();
  try {
    await addConnection(workspaceId, parsed.input);
  } catch (e) {
    const { name, url, transport, authType = "none" } = parsed.input;
    return { error: settingsError(e), values: { name, url, transport, authType } }; // what was typed stays, bar the token
  }
  revalidatePath("/settings/connections");
  return {};
}

export async function updateConnectionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = Id.safeParse(String(formData.get("id") ?? "")); // from a hidden field: user input like any other
  if (!id.success) return { error: "That connection could not be found" };
  const parsed = parseConnectionForm(formData, "edit");
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values: parsed.values };

  const { workspaceId } = await requireSession();
  try {
    await updateConnection(workspaceId, id.data, parsed.input);
  } catch (e) {
    return { error: settingsError(e) };
  }
  revalidatePath("/settings/connections");
  return {};
}

export async function deleteConnectionAction(id: string): Promise<FormState> {
  const input = Id.safeParse(id);
  if (!input.success) return { error: "That connection could not be found" };

  const { workspaceId } = await requireSession();
  try {
    await deleteConnection(workspaceId, input.data);
  } catch (e) {
    return { error: settingsError(e) };
  }
  revalidatePath("/settings/connections");
  return {};
}

export async function updateLimitsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseLimitsForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values: parsed.values };

  const { workspaceId, role } = await requireSession();
  // the form is read-only for members; the action checks again, because anyone can post to it
  if (role === "member") return { error: "Only an owner or an admin can change the limits." };
  try {
    await updateLimits(workspaceId, parsed.limits);
  } catch (e) {
    return { error: settingsError(e) };
  }
  revalidatePath("/settings/limits");
  return {};
}

export type InviteState = FormState & { link?: string; email?: string };

export async function inviteMemberAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const values = { email: String(formData.get("email") ?? "").trim(), role: String(formData.get("role") ?? "member") };
  const parsed = InviteInput.safeParse(values);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

  const session = await requireSession();
  // the form is only shown to owners and admins; the action checks again, because anyone can post to it
  if (session.role === "member") return { error: "Only an owner or an admin can invite people to this workspace.", values };
  try {
    // Asked first, in our words: the auth package says it with a plain Error, which inviteError cannot tell from a crash
    const members = await listMembers(session.workspaceId);
    if (members.some((m) => m.email.toLowerCase() === parsed.data.email.toLowerCase()))
      return { error: `${parsed.data.email} is already a member of this workspace.`, values };
    const { link } = await inviteMember(session, parsed.data);
    revalidatePath("/settings/members");
    return { link, email: parsed.data.email };
  } catch (e) {
    return { error: inviteError(e), values };
  }
}

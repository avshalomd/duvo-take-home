"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { InviteInput } from "@/contracts/auth";
import { MEMBER_NOT_FOUND, ONLY_MANAGERS_CHANGE_ROLES, ONLY_MANAGERS_REMOVE } from "@/lib/auth/member-rules";
import { changeMemberRole, inviteMember, listMembers, removeFromWorkspace } from "@/lib/auth/members";
import { leftWorkspaceRefusal, requireSession } from "@/lib/auth/session";
import {
  ConnectionNameTakenError,
  PrivateAddressError,
  addConnection,
  deleteConnection,
  setConnectionEnabled,
  updateConnection,
} from "@/lib/connections/store";
import { updateLimits } from "@/lib/usage/budget";
import type { FormState } from "../actions";
import { parseConnectionForm } from "./connection-form";
import { inviteError, memberError, settingsError } from "./errors";
import { parseLimitsForm } from "./limits-form";
import { canChangeSettings } from "@/lib/auth/roles";

// Every action returns its state instead of throwing, and takes the workspace from the session, never from the
// form: a Server Action is a public endpoint, so its arguments are validated like any other input. The role is
// checked first in every write: the pages hide the controls from members, but anyone can post to an action (Q80).

const Id = z.uuid();
const CONNECTIONS_READ_ONLY = "Only an owner or an admin can change the connections.";

/** The workspace an owner or admin may change, or null for a member. */
async function workspaceToChange(): Promise<string | null> {
  const { workspaceId, role } = await requireSession();
  return canChangeSettings(role) ? workspaceId : null;
}

export async function setConnectionEnabledAction(id: string, enabled: boolean): Promise<FormState> {
  const workspaceId = await workspaceToChange();
  if (!workspaceId) return { error: CONNECTIONS_READ_ONLY };
  const input = z.object({ id: Id, enabled: z.boolean() }).safeParse({ id, enabled });
  if (!input.success) return { error: "That connection could not be found" };

  try {
    await setConnectionEnabled(workspaceId, input.data.id, input.data.enabled);
  } catch (e) {
    return { error: settingsError(e) };
  }
  revalidatePath("/settings/connections");
  return {};
}

export async function addConnectionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const workspaceId = await workspaceToChange();
  if (!workspaceId) return { error: CONNECTIONS_READ_ONLY };
  const left = await leftWorkspaceRefusal(); // names no connection: it would be added to the workspace fallen back to
  if (left) return { error: left };
  const parsed = parseConnectionForm(formData, "add");
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values: parsed.values };

  try {
    await addConnection(workspaceId, parsed.input);
  } catch (e) {
    const { name, url, transport, authType = "none" } = parsed.input;
    const values = { name, url, transport, authType }; // what was typed stays, bar the token
    if (e instanceof ConnectionNameTakenError) return { fieldErrors: { name: [e.message] }, values }; // Q126: beside the field to change
    if (e instanceof PrivateAddressError) return { fieldErrors: { url: [e.message] }, values }; // the name resolves inside: the address to change
    return { error: settingsError(e), values };
  }
  revalidatePath("/settings/connections");
  return {};
}

export async function updateConnectionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const workspaceId = await workspaceToChange();
  if (!workspaceId) return { error: CONNECTIONS_READ_ONLY };
  const id = Id.safeParse(String(formData.get("id") ?? "")); // from a hidden field: user input like any other
  if (!id.success) return { error: "That connection could not be found" };
  const parsed = parseConnectionForm(formData, "edit");
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values: parsed.values };

  try {
    await updateConnection(workspaceId, id.data, parsed.input); // a new server drops the saved credentials: the store's rule
  } catch (e) {
    const { name, url, transport, authType = "none" } = parsed.input;
    const values = { name, url, transport, authType };
    if (e instanceof ConnectionNameTakenError) return { fieldErrors: { name: [e.message] }, values };
    if (e instanceof PrivateAddressError) return { fieldErrors: { url: [e.message] }, values };
    return { error: settingsError(e) };
  }
  revalidatePath("/settings/connections");
  return {};
}

export async function deleteConnectionAction(id: string): Promise<FormState> {
  const workspaceId = await workspaceToChange();
  if (!workspaceId) return { error: CONNECTIONS_READ_ONLY };
  const input = Id.safeParse(id);
  if (!input.success) return { error: "That connection could not be found" };

  try {
    await deleteConnection(workspaceId, input.data);
  } catch (e) {
    return { error: settingsError(e) };
  }
  revalidatePath("/settings/connections");
  return {};
}

export async function updateLimitsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const workspaceId = await workspaceToChange();
  if (!workspaceId) return { error: "Only an owner or an admin can change the limits." };
  const left = await leftWorkspaceRefusal(); // the limits of the workspace fallen back to are not the ones on screen
  if (left) return { error: left };
  const parsed = parseLimitsForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values: parsed.values };

  try {
    await updateLimits(workspaceId, parsed.limits);
  } catch (e) {
    return { error: settingsError(e) };
  }
  revalidatePath("/settings/limits");
  return {};
}

// A membership's id is Better Auth's generated id: letters, digits, - and _. Never an email, which its removal would
// look up by address instead.
const MemberId = z.string().regex(/^[\w-]{1,100}$/);
const MemberRole = z.enum(["member", "admin", "owner"], "Choose Member, Admin or Owner.");

/** Removes someone from the workspace on screen (Q169); the Members page re-renders without them. */
export async function removeMemberAction(memberId: string): Promise<FormState> {
  const session = await requireSession();
  if (!canChangeSettings(session.role)) return { error: ONLY_MANAGERS_REMOVE };
  const id = MemberId.safeParse(memberId);
  if (!id.success) return { error: MEMBER_NOT_FOUND };

  try {
    await removeFromWorkspace(await headers(), session, id.data);
  } catch (e) {
    return { error: memberError(e) };
  }
  revalidatePath("/settings/members");
  return {};
}

/** Makes someone of the workspace on screen a member, an admin or an owner; the page re-renders with the new role. */
export async function changeMemberRoleAction(memberId: string, role: string): Promise<FormState> {
  const session = await requireSession();
  if (!canChangeSettings(session.role)) return { error: ONLY_MANAGERS_CHANGE_ROLES };
  const id = MemberId.safeParse(memberId);
  if (!id.success) return { error: MEMBER_NOT_FOUND };
  const to = MemberRole.safeParse(role);
  if (!to.success) return { error: to.error.issues[0].message };

  try {
    await changeMemberRole(await headers(), session, id.data, to.data);
  } catch (e) {
    return { error: memberError(e) };
  }
  revalidatePath("/settings/members");
  return {};
}

export type InviteState = FormState & { link?: string; email?: string };

export async function inviteMemberAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const values = { email: String(formData.get("email") ?? "").trim(), role: String(formData.get("role") ?? "member") };
  const session = await requireSession();
  if (!canChangeSettings(session.role)) return { error: "Only an owner or an admin can invite people to this workspace.", values };
  const left = await leftWorkspaceRefusal(); // the invitation would be to the workspace fallen back to, not the one on screen
  if (left) return { error: left, values };
  const parsed = InviteInput.safeParse(values);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

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

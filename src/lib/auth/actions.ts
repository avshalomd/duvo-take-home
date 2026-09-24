"use server";

import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { WorkspaceSummary } from "@/contracts/auth";
import { noNul } from "@/contracts/text";
import { auth } from "./auth";
import { listWorkspaces, revokeInvitation } from "./members";
import { safeNext, withNext } from "./paths";
import { requireSession } from "./session";
import { workspaceSlug } from "./workspace-name";

/**
 * After the active workspace changed: every page shows another workspace's data now, so the router's cached
 * pages (and the top bar in the shared layout) are thrown away before Home opens.
 */
function openWorkspaceHome(): never {
  revalidatePath("/", "layout");
  redirect("/");
}

// The user menu's and the invitation page's writes. Each reads the session itself (never an id from the client
// for who is asking); Better Auth checks membership before it switches or accepts anything.

/** The workspaces (and who is signed in) for the user menu, loaded when it opens so the top bar needs no extra props. */
export async function loadWorkspaces(): Promise<{ activeId: string; email: string; workspaces: WorkspaceSummary[] }> {
  const ctx = await requireSession();
  return { activeId: ctx.workspaceId, email: ctx.email, workspaces: await listWorkspaces(ctx.userId) };
}

export type SwitchState = { error?: string };

/**
 * Makes another of the user's workspaces the active one, then opens Home: a run open on screen belongs to the old
 * one. A workspace the user is not in (a forged request, or a membership removed while the menu was open) is refused
 * here in words: Better Auth would refuse it too, but by throwing, which the browser got as a 500 (security QA).
 */
export async function trySwitchWorkspace(workspaceId: string): Promise<SwitchState> {
  const ctx = await requireSession();
  const id = z.string().min(1).max(100).safeParse(workspaceId);
  const mine = id.success && (await listWorkspaces(ctx.userId)).some((w) => w.id === id.data);
  if (!id.success || !mine) return { error: "You are not a member of that workspace, so it cannot be opened." };
  await auth.api.setActiveOrganization({ headers: await headers(), body: { organizationId: id.data } });
  openWorkspaceHome();
}

export type NewWorkspaceState = { error?: string; name?: string };

const NewWorkspace = z.object({ name: noNul(z.string().trim().min(1, "Give the workspace a name").max(60, "Keep the name under 60 characters")) });

/** A new, empty workspace with the user as its owner; Better Auth makes it the active one. */
export async function createWorkspace(_prev: NewWorkspaceState, form: FormData): Promise<NewWorkspaceState> {
  await requireSession();
  const parsed = NewWorkspace.safeParse({ name: form.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0].message, name: String(form.get("name") ?? "") };
  const { name } = parsed.data;
  await auth.api.createOrganization({
    headers: await headers(),
    body: { name, slug: workspaceSlug(name, crypto.randomUUID().slice(0, 6)) },
  });
  openWorkspaceHome();
}

/** Ends the session and opens the sign-in page, which returns to `next` (the invitation page uses it) after. */
export async function signOut(next?: string) {
  await auth.api.signOut({ headers: await headers() }); // nextCookies() clears the cookie on this action's response
  redirect(withNext("/sign-in", safeNext(next)));
}

// An invitation's id as Better Auth makes it; anything else (a forged call's) matches no invitation.
const InvitationId = z.string().min(1).max(100);
const INVITATION_GONE = "This invitation has expired or was already used. Ask for a new link.";

/** Revokes a pending invitation of the active workspace; the Members page re-renders without it. */
export async function revokeInvitationAction(invitationId: string): Promise<{ error?: string }> {
  const ctx = await requireSession();
  const id = InvitationId.safeParse(invitationId); // a forged call's id: refused in words, not thrown (F16)
  if (!id.success) return { error: "That invitation is no longer pending." };
  try {
    await revokeInvitation(ctx, id.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "That invitation could not be revoked." }; // our own plain sentences
  }
  revalidatePath("/settings/members");
  return {};
}

export type AcceptState = { error?: string };

/** Accepts the invitation for the signed-in user and lands them in its workspace (Better Auth makes it active). */
export async function acceptInvitation(invitationId: string): Promise<AcceptState> {
  await requireSession();
  const id = InvitationId.safeParse(invitationId); // not a string, or no id's length: no invitation has it (F16)
  if (!id.success) return { error: INVITATION_GONE };
  try {
    await auth.api.acceptInvitation({ headers: await headers(), body: { invitationId: id.data } });
  } catch (e) {
    const code = e instanceof APIError ? e.body?.code : undefined;
    if (code === "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION") return { error: "This invitation was sent to another email address." };
    if (code === "INVITATION_NOT_FOUND") return { error: INVITATION_GONE };
    throw e; // anything else is a real failure: the error page, with the stack in the log
  }
  openWorkspaceHome();
}

import "server-only";
import { APIError } from "better-auth/api";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db, transaction, type Tx } from "@/db";
import { invitation, member, organization, user } from "@/db/schema";
import type { InviteMember, ListMembers, ListWorkspaces, Member, SessionCtx } from "@/contracts/auth";
import { InviteInput } from "@/contracts/auth";
import { auth } from "./auth";
import { ASKER_GONE, MEMBER_NOT_FOUND, MemberChangeError, removalRefusal, roleChangeRefusal } from "./member-rules";
import { canChangeSettings } from "./roles";
import { toRole } from "./session-ctx";

/** Who belongs to the workspace, earliest first, so the owner who made it leads the list. */
export const listMembers: ListMembers = async (workspaceId) => {
  const rows = await db
    .select({ memberId: member.id, userId: user.id, name: user.name, email: user.email, role: member.role, joinedAt: member.createdAt })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, workspaceId))
    .orderBy(asc(member.createdAt));
  return rows.map((r): Member => ({ ...r, role: toRole(r.role), joinedAt: r.joinedAt.toISOString() }));
};

/** The workspaces the user can switch to, the personal one (joined first) first. */
export const listWorkspaces: ListWorkspaces = async (userId) => {
  const rows = await db
    .select({ id: organization.id, name: organization.name, role: member.role })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt));
  return rows.map((r) => ({ ...r, role: toRole(r.role) }));
};

export type InvitationView = { id: string; email: string; workspaceName: string; inviterName: string; open: boolean };

/** What the invitation page shows before anyone signs in: who invited whom to which workspace, and whether it is still open. */
export async function getInvitation(id: string): Promise<InvitationView | null> {
  const [row] = await db
    .select({ id: invitation.id, email: invitation.email, status: invitation.status, expiresAt: invitation.expiresAt, workspaceName: organization.name, inviterName: user.name })
    .from(invitation)
    .innerJoin(organization, eq(invitation.organizationId, organization.id))
    .innerJoin(user, eq(invitation.inviterId, user.id))
    .where(eq(invitation.id, id));
  if (!row) return null;
  const open = row.status === "pending" && row.expiresAt > new Date(); // accepted, cancelled or past 48 hours: closed
  return { id: row.id, email: row.email, workspaceName: row.workspaceName, inviterName: row.inviterName, open };
}

/** The link an invited person opens. No mail provider is configured, so the inviter copies and sends it. */
export function inviteLink(invitationId: string): string {
  const base = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/invite/${invitationId}`;
}

/**
 * The invitation itself is Better Auth's (the organization plugin checks the inviter's role, refuses an email that
 * is already a member and expires the invitation after 48 hours); it needs the inviter's request headers to know
 * who asks. Split from inviteMember so the integration test can pass the headers a request would carry.
 */
export async function createInvite(requestHeaders: Headers, ctx: SessionCtx, input: InviteInput): Promise<{ link: string }> {
  const { email, role } = InviteInput.parse(input);
  if (!canChangeSettings(ctx.role)) throw new Error("Only an owner or an admin can invite people to this workspace.");
  try {
    // Better Auth's resend only renews a pending invitation, role and all: one with another role is revoked first,
    // so the new invitation (and its new link) carries the role asked for now, and the old link stops working.
    const pending = await pendingInvitationFor(ctx.workspaceId, email);
    if (pending && toRole(pending.role ?? "") !== role) {
      await auth.api.cancelInvitation({ headers: requestHeaders, body: { invitationId: pending.id } });
    }
    const invitation = await auth.api.createInvitation({
      headers: requestHeaders,
      // resend: inviting the same address again with the same role renews the pending invitation (same link)
      body: { email, role, organizationId: ctx.workspaceId, resend: true },
    });
    return { link: inviteLink(invitation.id) };
  } catch (e) {
    if (e instanceof APIError && e.body?.code === "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION") {
      throw new Error(`${email} is already a member of this workspace.`);
    }
    throw e;
  }
}

export const inviteMember: InviteMember = async (ctx, input) => createInvite(await headers(), ctx, input);

/** The workspace's open invitation for this address, if there is one (Better Auth keeps at most one pending). */
async function pendingInvitationFor(workspaceId: string, email: string) {
  const [row] = await db
    .select({ id: invitation.id, role: invitation.role })
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, workspaceId),
        eq(sql`lower(${invitation.email})`, email.toLowerCase()), // Better Auth stores it in lower case; the form may not
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type PendingInvitation = { id: string; email: string; role: string; expiresAt: string; link: string };

/**
 * The workspace's invitations nobody has used yet, newest first, each with its link, so it can be copied again
 * after a reload (Q109). Accepted, revoked and expired ones are left out: their links no longer work. Owners and
 * admins only: an invitation's id is its link, and a member who read it could accept it as the invited address.
 */
export async function listInvitations(ctx: Pick<SessionCtx, "workspaceId" | "role">): Promise<PendingInvitation[]> {
  if (!canChangeSettings(ctx.role)) throw new Error("Only an owner or an admin can see the pending invitations.");
  const rows = await db
    .select({ id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt })
    .from(invitation)
    .where(and(eq(invitation.organizationId, ctx.workspaceId), eq(invitation.status, "pending"), gt(invitation.expiresAt, new Date())))
    .orderBy(desc(invitation.createdAt));
  return rows.map((r) => ({ ...r, role: toRole(r.role ?? ""), expiresAt: r.expiresAt.toISOString(), link: inviteLink(r.id) }));
}

/**
 * Revokes a pending invitation of the active workspace, so its link stops working. Better Auth does the cancel
 * (and checks the role again); the workspace check is ours, because the plugin accepts any workspace the user
 * belongs to, and an action only ever touches the one on screen.
 */
export async function revokeInvite(requestHeaders: Headers, ctx: SessionCtx, id: string): Promise<void> {
  if (!canChangeSettings(ctx.role)) throw new Error("Only an owner or an admin can revoke an invitation.");
  const [row] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(and(eq(invitation.id, id), eq(invitation.organizationId, ctx.workspaceId), eq(invitation.status, "pending")));
  if (!row) throw new Error("That invitation is no longer pending."); // gone, used, or another workspace's: one answer
  await auth.api.cancelInvitation({ headers: requestHeaders, body: { invitationId: id } });
}

export async function revokeInvitation(ctx: SessionCtx, id: string): Promise<void> {
  return revokeInvite(await headers(), ctx, id);
}

/**
 * Role changes and removals of one workspace, one at a time (review R2). The owner count the rules read and Better
 * Auth's write happen under one lock, so two owners demoting or removing each other at once cannot both read "two
 * owners" and leave the workspace with none. Better Auth writes through its own connection and commits at once; the
 * lock is released at our commit, after that write, so the next change in line reads it.
 */
async function oneChangeAtATime<T>(workspaceId: string, change: (tx: Tx) => Promise<T>): Promise<T> {
  return transaction(async (tx) => {
    // The two-key form is its own key space, so it is never a run start's one-key workspace lock; the constant first
    // key keeps it apart from the run starts' own two-key lock (lib/runs/start.ts).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('handover:member-changes'), hashtext(${workspaceId}))`);
    return change(tx);
  });
}

/**
 * The asker and the person changed, as they are in the workspace now, and how many owners it has; any other id is
 * "not found". Read under the lock, so a change that landed while the page was open counts: the asker's role is read
 * here too, not taken from the session, since they may have been demoted or removed meanwhile.
 */
async function membershipIn(tx: Tx, workspaceId: string, askerId: string, memberId: string) {
  const rows = await tx.select({ id: member.id, userId: member.userId, role: member.role }).from(member).where(eq(member.organizationId, workspaceId));
  const found = rows.find((r) => r.id === memberId);
  if (!found) throw new MemberChangeError(MEMBER_NOT_FOUND);
  const asker = rows.find((r) => r.userId === askerId);
  if (!asker) throw new MemberChangeError(ASKER_GONE);
  const owners = rows.filter((r) => toRole(r.role) === "owner").length;
  return { actor: { userId: askerId, role: toRole(asker.role) }, target: { userId: found.userId, role: toRole(found.role) }, owners };
}

/**
 * Closes the pending invitations this person sent from the workspace (review R2). Accepting an invitation does not ask
 * whether its sender may still invite, so a removed admin could otherwise rejoin through one sent to another address of
 * theirs. Written in the lock's transaction before Better Auth's call, so a refusal from it rolls this back too (neither
 * of its calls touches invitations, so nothing waits on these rows).
 */
async function closeInvitationsSentBy(tx: Tx, workspaceId: string, userId: string): Promise<void> {
  await tx
    .update(invitation)
    .set({ status: "canceled" }) // Better Auth's own word for a revoked invitation
    .where(and(eq(invitation.organizationId, workspaceId), eq(invitation.inviterId, userId), eq(invitation.status, "pending")));
}

/**
 * Removes someone from the active workspace (Q169): the app's rules first (member-rules.ts), then Better Auth's own
 * removal with the asker's headers, so its permission check runs as well. The removed person's sessions still name
 * the workspace; their next request finds no membership in it and opens a workspace of their own (session.ts).
 */
export async function removeFromWorkspace(requestHeaders: Headers, ctx: SessionCtx, memberId: string): Promise<void> {
  await oneChangeAtATime(ctx.workspaceId, async (tx) => {
    const { actor, target, owners } = await membershipIn(tx, ctx.workspaceId, ctx.userId, memberId);
    const refusal = removalRefusal(actor, target, owners);
    if (refusal) throw new MemberChangeError(refusal);
    await closeInvitationsSentBy(tx, ctx.workspaceId, target.userId);
    // the workspace named, not left to the session: the change is made where the page is, whatever Better Auth thinks is active
    await auth.api.removeMember({ headers: requestHeaders, body: { memberIdOrEmail: memberId, organizationId: ctx.workspaceId } });
  });
}

/** Makes someone of the active workspace a member, an admin or an owner, under the same rules and the same lock. */
export async function changeMemberRole(requestHeaders: Headers, ctx: SessionCtx, memberId: string, role: SessionCtx["role"]): Promise<void> {
  await oneChangeAtATime(ctx.workspaceId, async (tx) => {
    const { actor, target, owners } = await membershipIn(tx, ctx.workspaceId, ctx.userId, memberId);
    const refusal = roleChangeRefusal(actor, target, role, owners);
    if (refusal) throw new MemberChangeError(refusal);
    if (target.role === role) return; // already so: nothing to write
    if (!canChangeSettings(role)) await closeInvitationsSentBy(tx, ctx.workspaceId, target.userId); // a member cannot invite
    await auth.api.updateMemberRole({ headers: requestHeaders, body: { memberId, role, organizationId: ctx.workspaceId } });
  });
}

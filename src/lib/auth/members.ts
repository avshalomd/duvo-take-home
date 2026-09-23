import "server-only";
import { APIError } from "better-auth/api";
import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { invitation, member, organization, user } from "@/db/schema";
import type { InviteMember, ListMembers, ListWorkspaces, Member, SessionCtx } from "@/contracts/auth";
import { InviteInput } from "@/contracts/auth";
import { auth } from "./auth";
import { toRole } from "./session-ctx";

/** Who belongs to the workspace, earliest first, so the owner who made it leads the list. */
export const listMembers: ListMembers = async (workspaceId) => {
  const rows = await db
    .select({ userId: user.id, name: user.name, email: user.email, role: member.role, joinedAt: member.createdAt })
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
  if (ctx.role === "member") throw new Error("Only an owner or an admin can invite people to this workspace.");
  try {
    const invitation = await auth.api.createInvitation({
      headers: requestHeaders,
      // resend: inviting the same address again renews the pending invitation instead of failing
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

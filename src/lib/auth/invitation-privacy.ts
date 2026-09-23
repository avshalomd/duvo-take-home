import "server-only";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { member } from "@/db/schema";
import { canChangeSettings } from "./roles";
import { toRole } from "./session-ctx";

/**
 * An invitation's id is the proof of holding its link: with it, whoever has an account for the invited email can
 * accept it. So the id goes only to the owners and admins who send invitations (the Members page, lib/auth/members.ts)
 * and to the invited person inside the link itself. Better Auth's organization plugin hands ids out to any member, so
 * these hooks close its three ways: over HTTP and through auth.api alike, since both run Better Auth's hooks. Our own
 * client calls none of these endpoints (it only signs in and up); the full-workspace one keeps working, without ids.
 */

const NOT_YOURS = "Only an owner or an admin can see the workspace's invitations.";

/** True for an owner or an admin of the workspace (the highest of roles like "admin,member" counts); false for anyone else. */
async function managesWorkspace(userId: string, workspaceId: string): Promise<boolean> {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, workspaceId)));
  return row ? canChangeSettings(toRole(row.role)) : false;
}

export const refuseInvitationLists = createAuthMiddleware(async (ctx) => {
  // "Invitations sent to me": an account made for an address before it was invited would read the id here, without
  // the link. The invited person has the link; nobody needs this list.
  if (ctx.path === "/organization/list-user-invitations") throw new APIError("FORBIDDEN", { message: NOT_YOURS });
  if (ctx.path !== "/organization/list-invitations") return;
  const session = await getSessionFromCtx(ctx);
  if (!session) return; // the endpoint answers 401 itself
  const workspaceId = (ctx.query as { organizationId?: string } | undefined)?.organizationId ?? session.session.activeOrganizationId;
  if (!workspaceId || !(await managesWorkspace(session.user.id, workspaceId))) throw new APIError("FORBIDDEN", { message: NOT_YOURS });
});

export const stripInvitationsForMembers = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/organization/get-full-organization") return;
  const workspace = ctx.context.returned;
  // An error, or null for "no active workspace": nothing to strip
  if (!workspace || typeof workspace !== "object" || !("id" in workspace) || !("invitations" in workspace)) return;
  const session = await getSessionFromCtx(ctx);
  if (session && (await managesWorkspace(session.user.id, String(workspace.id)))) return;
  return ctx.json({ ...workspace, invitations: [] }); // the members, the name and the rest stay as Better Auth gave them
});

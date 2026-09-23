import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { member, organization, session } from "@/db/schema";
import type { Membership } from "./session-ctx";
import { personalWorkspaceName, workspaceSlug } from "./workspace-name";

// The database side of workspaces: Better Auth's "organization" rows are our workspaces, "member" rows say who
// belongs to which, and session.active_organization_id says which one a signed-in browser is looking at.

/** Every workspace the user belongs to, oldest membership first. */
export async function membershipsOf(userId: string): Promise<Membership[]> {
  const rows = await db
    .select({ workspaceId: organization.id, workspaceName: organization.name, role: member.role, joinedAt: member.createdAt })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt));
  return rows;
}

/** The workspace a new session starts in: the one the user joined first, or null before they have any. */
export async function firstWorkspaceId(userId: string): Promise<string | null> {
  const [row] = await db.select({ id: member.organizationId }).from(member).where(eq(member.userId, userId)).orderBy(asc(member.createdAt)).limit(1);
  return row?.id ?? null;
}

export async function setActiveWorkspace(sessionId: string, workspaceId: string) {
  await db.update(session).set({ activeOrganizationId: workspaceId }).where(eq(session.id, sessionId));
}

/**
 * Every account gets a workspace of its own, with the user as its owner, so there is never a signed-in user with
 * nowhere to put a run. The three writes go in one db.batch, which the Neon HTTP driver runs as one transaction:
 * a workspace without its owner, or an owner without the workspace, can never be left behind.
 */
export async function createPersonalWorkspace(user: { id: string; name: string }): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.batch([
    db.insert(organization).values({
      id,
      name: personalWorkspaceName(user.name),
      slug: workspaceSlug(user.name, id.slice(0, 6)), // the id's first characters make the slug unique enough
      createdAt: now,
    }),
    db.insert(member).values({ id: crypto.randomUUID(), organizationId: id, userId: user.id, role: "owner", createdAt: now }),
    // Sign-up creates the session before this hook runs (Better Auth runs "after" hooks at the end of the
    // sign-up), so the new session is pointed at the new workspace here.
    db.update(session).set({ activeOrganizationId: id }).where(and(eq(session.userId, user.id), isNull(session.activeOrganizationId))),
  ]);
  return id;
}

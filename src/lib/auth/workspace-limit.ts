import "server-only";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { member } from "@/db/schema";

// A few workspaces per person (security review S1, his call 2026-09-24): each workspace has a daily budget of its own,
// so an account that made ten of them had ten budgets on the operator's key. The personal one counts among the five.
export const MAX_OWNED_WORKSPACES = 5;

/** How many workspaces this person owns. */
export async function ownedWorkspaceCount(userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(member).where(and(eq(member.userId, userId), eq(member.role, "owner")));
  return row.n;
}

/** The refusal for one more workspace, or null while the person owns fewer than the most. */
export async function workspaceLimitRefusal(userId: string): Promise<string | null> {
  return (await ownedWorkspaceCount(userId)) >= MAX_OWNED_WORKSPACES
    ? `You already own ${MAX_OWNED_WORKSPACES} workspaces, the most one person can have.`
    : null;
}

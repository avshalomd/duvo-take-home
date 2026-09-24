import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { connections } from "@/db/schema";

/**
 * The reads the sign-in needs that the connections store does not offer: a connection with its raw OAuth state,
 * and the one connection waiting for a given state (the callback knows only the state). The OAuth state itself
 * is written through the store's setConnectionOAuth; the writes here are the sign-in's tokens (conditional) and the auth type.
 */
export type OAuthRow = { id: string; workspaceId: string; name: string; url: string; oauth: unknown };

const columns = { id: connections.id, workspaceId: connections.workspaceId, name: connections.name, url: connections.url, oauth: connections.oauth };
const toRow = (r: { id: string; workspaceId: string | null; name: string; url: string; oauth: unknown }): OAuthRow => ({ ...r, workspaceId: r.workspaceId ?? "" });

/** A connection of this workspace, or null: the workspace comes from the session, so another workspace's id finds nothing. */
export async function findConnection(workspaceId: string, id: string): Promise<OAuthRow | null> {
  const [row] = await db.select(columns).from(connections).where(and(eq(connections.id, id), eq(connections.workspaceId, workspaceId)));
  return row ? toRow(row) : null;
}

/** The connection whose pending sign-in carries this state, in any workspace: the callback learns the workspace from it. */
export async function findByPendingState(state: string): Promise<OAuthRow | null> {
  const [row] = await db.select(columns).from(connections).where(sql`${connections.oauth} -> 'pending' ->> 'state' = ${state}`);
  return row ? toRow(row) : null;
}

/** The workspace and the current OAuth state of a connection, re-read before a write (a run holds an older copy). */
export async function loadOAuth(id: string): Promise<{ workspaceId: string; oauth: unknown } | null> {
  const [row] = await db.select({ workspaceId: connections.workspaceId, oauth: connections.oauth }).from(connections).where(eq(connections.id, id));
  return row ? { workspaceId: row.workspaceId ?? "", oauth: row.oauth } : null;
}

/**
 * The sign-in's tokens, written only onto the connection as the sign-in left it (security review S3): the same
 * address, its sign-in state still there, and no newer sign-in pending. The code exchange is a network round trip, and
 * an edit landing during it (a move to another server clears the state) must not receive the tokens. False: nothing written.
 */
export async function storeTokensIfUnchanged(workspaceId: string, id: string, url: string, oauth: unknown): Promise<boolean> {
  const written = await db
    .update(connections)
    .set({ oauth, updatedAt: new Date() })
    .where(
      and(
        eq(connections.id, id),
        eq(connections.workspaceId, workspaceId),
        eq(connections.url, url),
        sql`${connections.oauth} is not null`,
        sql`${connections.oauth} ->> 'pending' is null`, // ->> reads a JSON null as SQL null: "pending": null counts as none
      ),
    )
    .returning({ id: connections.id });
  return written.length > 0;
}

/** After a completed sign-in the connection authenticates with OAuth, whatever it was added as. */
export async function markOAuth(workspaceId: string, id: string): Promise<void> {
  await db.update(connections).set({ authType: "oauth" }).where(and(eq(connections.id, id), eq(connections.workspaceId, workspaceId)));
}

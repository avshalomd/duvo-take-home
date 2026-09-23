import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { connections } from "@/db/schema";
import type {
  AddConnection,
  ConnectionSecret,
  DeleteConnection,
  ListConnections,
  ListEnabledConnectionsWithSecrets,
  RecordConnectionSeen,
  SetConnectionEnabled,
  SetConnectionOAuth,
  UpdateConnection,
} from "@/contracts/connection";
import { ConnectionEdit } from "@/contracts/connection";
import { encryptSecret } from "./crypto";
import { readToken, toConnection } from "./store-map";

/** An id that is not a connection of this workspace: another workspace's id reads as missing, never as someone else's row. */
export class ConnectionNotFoundError extends Error {
  constructor() {
    super("That connection could not be found. It may have been deleted - reload the page.");
    this.name = "ConnectionNotFoundError";
  }
}

// Every query below names the workspace: the id alone is never enough to read or change a row.
const mine = (workspaceId: string, id: string) => and(eq(connections.id, id), eq(connections.workspaceId, workspaceId));

// Only a server that signs in with a token keeps one. Switching to "no sign-in" or OAuth drops it, so a stale token
// is never sent. The token is written sealed into token_enc; the plain v1 column is emptied whenever a token is written.
type AuthType = "none" | "bearer" | "oauth";
const sealed = (token: string) => ({ tokenEnc: encryptSecret(token), token: null });
const noToken = { tokenEnc: null, token: null };

/** Every connection, oldest first, so the list does not jump around when one is toggled. */
export const listConnections: ListConnections = async (workspaceId) => {
  const rows = await db.select().from(connections).where(eq(connections.workspaceId, workspaceId)).orderBy(asc(connections.createdAt));
  return rows.map(toConnection);
};

export const setConnectionEnabled: SetConnectionEnabled = async (workspaceId, id, enabled) => {
  await db.update(connections).set({ enabled, updatedAt: new Date() }).where(mine(workspaceId, id));
};

/** The input is already validated with NewConnection in the Server Action; the store writes it. */
export const addConnection: AddConnection = async (workspaceId, input) => {
  const token = input.token ? input.token : null; // the add form sends "" when the field is left empty
  const authType: AuthType = input.authType ?? (token ? "bearer" : "none");
  const [row] = await db
    .insert(connections)
    .values({
      workspaceId,
      name: input.name,
      url: input.url,
      transport: input.transport,
      authType,
      ...(authType === "bearer" && token ? sealed(token) : noToken),
    })
    .returning();
  return toConnection(row);
};

/**
 * Edit a connection. The token is kept unless a new one is typed; clearToken removes it. Validated here as well as in
 * the action: the store is the last step before the row, so every caller meets the same URL rules as adding.
 */
export const updateConnection: UpdateConnection = async (workspaceId, id, input) => {
  const edit = ConnectionEdit.parse(input);
  const [current] = await db.select().from(connections).where(mine(workspaceId, id));
  if (!current) throw new ConnectionNotFoundError();

  const typed = edit.token ? edit.token : null; // "" is an empty field: keep what is saved
  const authType: AuthType = edit.authType ?? (typed ? "bearer" : (toConnection(current).authType ?? "none"));
  const tokenChange = authType !== "bearer" || edit.clearToken ? noToken : typed ? sealed(typed) : {}; // {} leaves both columns as they are

  const [row] = await db
    .update(connections)
    .set({ name: edit.name, url: edit.url, transport: edit.transport, authType, ...tokenChange, updatedAt: new Date() })
    .where(mine(workspaceId, id))
    .returning();
  if (!row) throw new ConnectionNotFoundError(); // deleted between the read and the write
  return toConnection(row);
};

/** Deleting an id that is not this workspace's deletes nothing, and says nothing either. */
export const deleteConnection: DeleteConnection = async (workspaceId, id) => {
  await db.delete(connections).where(mine(workspaceId, id));
};

/** Server-side only: the token goes into the agent's mcpServers headers and nowhere else. */
export const listEnabledConnectionsWithSecrets: ListEnabledConnectionsWithSecrets = async (workspaceId) => {
  const rows = await db
    .select()
    .from(connections)
    .where(and(eq(connections.enabled, true), eq(connections.workspaceId, workspaceId)))
    .orderBy(asc(connections.createdAt));
  return rows.map((row): ConnectionSecret => ({ ...toConnection(row), token: readToken(row), oauth: row.oauth }));
};

/** The run loop writes back what the init message said: the status, and the tools the server offered. */
export const recordConnectionSeen: RecordConnectionSeen = async (id, seen) => {
  await db.update(connections).set({ lastStatus: seen.lastStatus, ...(seen.tools ? { tools: seen.tools } : {}) }).where(eq(connections.id, id));
};

/** The OAuth module stores its state here (client registration, sealed tokens, expiry); the store does not read inside it. */
export const setConnectionOAuth: SetConnectionOAuth = async (workspaceId, id, oauth) => {
  await db.update(connections).set({ oauth, updatedAt: new Date() }).where(mine(workspaceId, id));
};

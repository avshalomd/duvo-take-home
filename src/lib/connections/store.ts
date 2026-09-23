import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { connections } from "@/db/schema";
import { and } from "drizzle-orm";
import type {
  AddConnection,
  Connection,
  ConnectionSecret,
  DeleteConnection,
  ListConnections,
  ListEnabledConnectionsWithSecrets,
  RecordConnectionSeen,
  SetConnectionEnabled,
  SetConnectionOAuth,
  UpdateConnection,
} from "@/contracts/connection";
import { Transport } from "@/contracts/connection";

type Row = typeof connections.$inferSelect;

// The one place a row becomes a Connection: it drops the token and answers hasToken, so no caller can leak it by accident.
function toConnection(row: Row): Connection {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    transport: Transport.catch("http").parse(row.transport), // the column is text; an unknown value reads as http rather than throwing on a list
    hasToken: row.token != null,
    enabled: row.enabled,
    lastStatus: row.lastStatus,
    authType: row.authType === "bearer" || row.authType === "oauth" ? row.authType : row.token ? "bearer" : "none",
    tools: row.tools ?? [],
  };
}

/** Every connection, oldest first, so the list does not jump around when one is toggled. */
export const listConnections: ListConnections = async (workspaceId) => {
  const rows = await db.select().from(connections).where(eq(connections.workspaceId, workspaceId)).orderBy(asc(connections.createdAt));
  return rows.map(toConnection);
};

export const setConnectionEnabled: SetConnectionEnabled = async (workspaceId, id, enabled) => {
  await db.update(connections).set({ enabled }).where(and(eq(connections.id, id), eq(connections.workspaceId, workspaceId)));
};

/** The input is already validated with NewConnection in the Server Action; the store writes it. */
export const addConnection: AddConnection = async (workspaceId, input) => {
  const [row] = await db
    .insert(connections)
    .values({
      workspaceId,
      name: input.name,
      url: input.url,
      transport: input.transport,
      token: input.token && input.token.length > 0 ? input.token : null, // the add form sends "" when the field is left empty
    })
    .returning();
  return toConnection(row);
};

/** Server-side only: the token goes into the agent's mcpServers headers and nowhere else. */
export const listEnabledConnectionsWithSecrets: ListEnabledConnectionsWithSecrets = async (workspaceId) => {
  const rows = await db
    .select()
    .from(connections)
    .where(and(eq(connections.enabled, true), eq(connections.workspaceId, workspaceId)))
    .orderBy(asc(connections.createdAt));
  return rows.map((row): ConnectionSecret => ({ ...toConnection(row), token: row.token, oauth: row.oauth })); // STUB: decrypt token_enc (settings package)
};

export const updateConnection: UpdateConnection = async () => {
  throw new Error("not implemented: updateConnection"); // STUB: the settings package
};
export const deleteConnection: DeleteConnection = async () => {
  throw new Error("not implemented: deleteConnection"); // STUB
};
/** The run loop writes back what the init message said: the status, and the tools the server offered. */
export const recordConnectionSeen: RecordConnectionSeen = async (id, seen) => {
  await db.update(connections).set({ lastStatus: seen.lastStatus, ...(seen.tools ? { tools: seen.tools } : {}) }).where(eq(connections.id, id));
};
export const setConnectionOAuth: SetConnectionOAuth = async () => {
  throw new Error("not implemented: setConnectionOAuth"); // STUB: the settings package
};

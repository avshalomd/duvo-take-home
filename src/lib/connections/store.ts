import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { connections } from "@/db/schema";
import type {
  AddConnection,
  Connection,
  ConnectionSecret,
  ListConnections,
  ListEnabledConnectionsWithSecrets,
  SetConnectionEnabled,
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
  };
}

/** Every connection, oldest first, so the list does not jump around when one is toggled. */
export const listConnections: ListConnections = async () => {
  const rows = await db.select().from(connections).orderBy(asc(connections.createdAt));
  return rows.map(toConnection);
};

export const setConnectionEnabled: SetConnectionEnabled = async (id, enabled) => {
  await db.update(connections).set({ enabled }).where(eq(connections.id, id));
};

/** The input is already validated with NewConnection in the Server Action; the store writes it. */
export const addConnection: AddConnection = async (input) => {
  const [row] = await db
    .insert(connections)
    .values({
      name: input.name,
      url: input.url,
      transport: input.transport,
      token: input.token && input.token.length > 0 ? input.token : null, // the add form sends "" when the field is left empty
    })
    .returning();
  return toConnection(row);
};

/** Server-side only: the token goes into the agent's mcpServers headers and nowhere else. */
export const listEnabledConnectionsWithSecrets: ListEnabledConnectionsWithSecrets = async () => {
  const rows = await db
    .select()
    .from(connections)
    .where(eq(connections.enabled, true))
    .orderBy(asc(connections.createdAt));
  return rows.map((row): ConnectionSecret => ({ ...toConnection(row), token: row.token }));
};

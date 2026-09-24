import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { CONNECTIONS_WS_KEY, connections } from "@/db/schema";
import { isUniqueViolation } from "@/db/unique-violation";
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
import { ConnectionEdit, PRIVATE_ADDRESS } from "@/contracts/connection";
import { hostReach } from "@/lib/net/address";
import { encryptSecret } from "./crypto";
import { connectionKey } from "./key";
import { readToken, toConnection } from "./store-map";
import { sameServer } from "./store-origin";

/** An id that is not a connection of this workspace: another workspace's id reads as missing, never as someone else's row. */
export class ConnectionNotFoundError extends Error {
  constructor() {
    super("That connection could not be found. It may have been deleted - reload the page.");
    this.name = "ConnectionNotFoundError";
  }
}

/**
 * Q126: a run registers each server under connectionKey(name), so two names with one key ("QA-Bearer", "qa bearer")
 * would let one server silently replace the other. The second name is refused, naming the one that has it.
 */
export class ConnectionNameTakenError extends Error {
  constructor(otherName: string) {
    super(`That name is already used by ${otherName}`);
    this.name = "ConnectionNameTakenError";
  }
}

/** The address's name resolves to a private or local network (security QA): the schema only sees what was typed. */
export class PrivateAddressError extends Error {
  constructor() {
    super(PRIVATE_ADDRESS);
    this.name = "PrivateAddressError";
  }
}

/**
 * Looks the address's host up before the row is written, and refuses it if any address is internal. A name that
 * does not resolve (yet) is saved: nothing is fetched now, and every run looks it up again before using it.
 */
async function ensureNotInternal(url: string): Promise<void> {
  if ((await hostReach(new URL(url).hostname)).reach === "internal") throw new PrivateAddressError();
}

/** Throws when another connection of the workspace (not `self`, the one being edited) already has the name's key. */
async function ensureNameFree(workspaceId: string, name: string, self?: string): Promise<void> {
  const key = connectionKey(name);
  const rows = await db.select({ id: connections.id, name: connections.name }).from(connections).where(eq(connections.workspaceId, workspaceId));
  const clash = rows.find((r) => r.id !== self && connectionKey(r.name) === key); // compared in code: the key is derived, not a column
  if (clash) throw new ConnectionNameTakenError(clash.name);
}

/**
 * A write the unique index refused because a connection with the name's key was written meanwhile (F6): the same
 * words as the check before it, naming the one that won. Any other error is passed on as it was.
 */
async function nameTakenMeanwhile(e: unknown, workspaceId: string, name: string, self?: string): Promise<never> {
  if (!isUniqueViolation(e, CONNECTIONS_WS_KEY)) throw e;
  await ensureNameFree(workspaceId, name, self); // throws ConnectionNameTakenError with the winner's name
  throw new ConnectionNameTakenError(name); // the winner was deleted since: still taken a moment ago
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

/** Another workspace's id, or one deleted meanwhile, changes nothing and says so rather than reporting success. */
export const setConnectionEnabled: SetConnectionEnabled = async (workspaceId, id, enabled) => {
  const changed = await db.update(connections).set({ enabled, updatedAt: new Date() }).where(mine(workspaceId, id)).returning({ id: connections.id });
  if (changed.length === 0) throw new ConnectionNotFoundError();
};

/** The input is already validated with NewConnection in the Server Action; the store writes it. */
export const addConnection: AddConnection = async (workspaceId, input) => {
  await ensureNameFree(workspaceId, input.name);
  await ensureNotInternal(input.url);
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
    .returning()
    .catch((e) => nameTakenMeanwhile(e, workspaceId, input.name));
  return toConnection(row);
};

/**
 * Edit a connection. The token is kept unless a new one is typed; clearToken removes it; and an address on another
 * server drops the saved token and OAuth sign-in (Q80). Validated here as well as in the action: the store is the
 * last step before the row, so every caller meets the same URL rules as adding.
 */
export const updateConnection: UpdateConnection = async (workspaceId, id, input) => {
  const edit = ConnectionEdit.parse(input);
  const [current] = await db.select().from(connections).where(mine(workspaceId, id));
  if (!current) throw new ConnectionNotFoundError();
  await ensureNameFree(workspaceId, edit.name, id); // its own name is not a clash
  await ensureNotInternal(edit.url);

  const typed = edit.token ? edit.token : null; // "" is an empty field: keep what is saved
  const authType: AuthType = edit.authType ?? (typed ? "bearer" : (toConnection(current).authType ?? "none"));
  // Credentials were given for one server. Without this, an empty token field would send the saved token to whatever
  // address was typed, attacker.example included.
  const moved = !sameServer(current.url, edit.url);

  const [row] = await db
    .update(connections)
    .set({
      name: edit.name,
      url: edit.url,
      transport: edit.transport,
      authType,
      ...tokenColumns({ authType, clearToken: edit.clearToken, typed, moved }),
      ...(moved ? { oauth: null } : {}), // the new server needs its own sign-in
      updatedAt: new Date(),
    })
    .where(mine(workspaceId, id))
    .returning()
    .catch((e) => nameTakenMeanwhile(e, workspaceId, edit.name, id));
  if (!row) throw new ConnectionNotFoundError(); // deleted between the read and the write
  return toConnection(row);
};

/** The token columns an edit writes; {} leaves both as they are. */
function tokenColumns(e: { authType: AuthType; clearToken?: boolean; typed: string | null; moved: boolean }) {
  if (e.authType !== "bearer" || e.clearToken) return noToken;
  if (e.typed) return sealed(e.typed);
  return e.moved ? noToken : {}; // an empty field keeps the saved token, but only on the server it was given for
}

/** Deleting an id that is not this workspace's (or is already gone) deletes nothing, and says it was not found. */
export const deleteConnection: DeleteConnection = async (workspaceId, id) => {
  const deleted = await db.delete(connections).where(mine(workspaceId, id)).returning({ id: connections.id });
  if (deleted.length === 0) throw new ConnectionNotFoundError();
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

// The OAuth module's reads of the connections table, against the real table. `npm run test:int`.
// Everything it creates is named "[int] ..." and deleted.
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { connections } from "@/db/schema";
import { findByPendingState, findConnection, loadOAuth, markOAuth, storeTokensIfUnchanged } from "./rows";

const WS = "int-oauth-workspace";
const OTHER_WS = "int-oauth-other-workspace";
const named = (what: string) => `[int] ${what}`;

async function insert(name: string, workspaceId = WS, oauth: unknown = null) {
  const [row] = await db.insert(connections).values({ workspaceId, name: named(name), url: "https://mcp.example.com/mcp", oauth }).returning();
  return row;
}

afterAll(async () => {
  // only this file's workspaces: int files run in parallel, and a "[int]%" sweep wiped other files' rows mid-test
  await db.delete(connections).where(inArray(connections.workspaceId, [WS, OTHER_WS]));
});

describe.skipIf(!process.env.DATABASE_URL)("oauth rows", () => {
  it("findConnection returns the connection of the workspace asked for, with its stored OAuth state", async () => {
    const row = await insert("find", WS, { hello: "world" });

    const found = await findConnection(WS, row.id);

    expect(found).toEqual({ id: row.id, workspaceId: WS, name: named("find"), url: "https://mcp.example.com/mcp", oauth: { hello: "world" } });
  });

  it("findConnection does not return another workspace's connection", async () => {
    const row = await insert("other ws", OTHER_WS);

    expect(await findConnection(WS, row.id)).toBeNull();
  });

  it("findByPendingState finds the one connection waiting for that state, in any workspace", async () => {
    const state = `int-state-${Date.now()}`;
    const row = await insert("pending", OTHER_WS, { pending: { state, verifierEnc: "x", createdAt: new Date().toISOString() } });
    await insert("pending decoy", WS, { pending: { state: `${state}-other`, verifierEnc: "x", createdAt: new Date().toISOString() } });

    const found = await findByPendingState(state);

    expect(found?.id).toBe(row.id);
    expect(found?.workspaceId).toBe(OTHER_WS);
  });

  it("findByPendingState returns null for a state nobody is waiting for", async () => {
    expect(await findByPendingState("int-no-such-state")).toBeNull();
  });

  it("loadOAuth reads the workspace and the current OAuth state of a connection by id", async () => {
    const row = await insert("load", WS, { tokens: null });

    expect(await loadOAuth(row.id)).toEqual({ workspaceId: WS, oauth: { tokens: null } });
  });

  it("markOAuth sets the auth type to oauth, only inside the given workspace", async () => {
    const row = await insert("mark");
    const other = await insert("mark other", OTHER_WS);

    await markOAuth(WS, row.id);
    await markOAuth(WS, other.id);

    const [after] = await db.select().from(connections).where(eq(connections.id, row.id));
    const [otherAfter] = await db.select().from(connections).where(eq(connections.id, other.id));
    expect(after.authType).toBe("oauth");
    expect(otherAfter.authType).toBe("none");
  });

  // Security review S3: the tokens land only on the connection as the sign-in left it
  it("storeTokensIfUnchanged writes the tokens while the address is the same and no sign-in is pending", async () => {
    const row = await insert("tokens ok", WS, { pending: null, tokens: null });

    expect(await storeTokensIfUnchanged(WS, row.id, row.url, { pending: null, tokens: { accessTokenEnc: "x" } })).toBe(true);

    expect((await loadOAuth(row.id))?.oauth).toEqual({ pending: null, tokens: { accessTokenEnc: "x" } });
  });

  it("storeTokensIfUnchanged writes nothing once the connection points at another server or its sign-in was reset", async () => {
    const moved = await insert("tokens moved", WS, { pending: null, tokens: null });
    await db.update(connections).set({ url: "https://attacker.example/mcp", oauth: null }).where(eq(connections.id, moved.id));

    expect(await storeTokensIfUnchanged(WS, moved.id, "https://mcp.example.com/mcp", { tokens: { accessTokenEnc: "x" } })).toBe(false);
    expect((await loadOAuth(moved.id))?.oauth).toBeNull();
  });

  it("storeTokensIfUnchanged writes nothing while a newer sign-in is pending, nor in another workspace", async () => {
    const newer = await insert("tokens newer", WS, { pending: { state: "int-newer" }, tokens: null });
    const other = await insert("tokens other ws", OTHER_WS, { pending: null, tokens: null });

    expect(await storeTokensIfUnchanged(WS, newer.id, newer.url, { tokens: { accessTokenEnc: "x" } })).toBe(false);
    expect(await storeTokensIfUnchanged(WS, other.id, other.url, { tokens: { accessTokenEnc: "x" } })).toBe(false);
    expect((await loadOAuth(newer.id))?.oauth).toEqual({ pending: { state: "int-newer" }, tokens: null });
  });
});

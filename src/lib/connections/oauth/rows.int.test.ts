// The OAuth module's reads of the connections table, against the real table. `npm run test:int`.
// Everything it creates is named "[int] ..." and deleted.
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { connections } from "@/db/schema";
import { findByPendingState, findConnection, loadOAuth, markOAuth } from "./rows";

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
});

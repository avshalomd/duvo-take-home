// The connections store against the real table. `npm run test:int`. The database is shared with other agents, so
// everything here lives in two workspaces of its own ("int-settings-a", "int-settings-b") and is deleted afterwards.
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { connections } from "@/db/schema";
import { blob } from "./oauth/fake-store";
import {
  addConnection,
  deleteConnection,
  listConnections,
  listEnabledConnectionsWithSecrets,
  setConnectionEnabled,
  setConnectionOAuth,
  updateConnection,
} from "./store";

const A = "int-settings-a"; // tenancy: every call names the workspace, as the session would
const B = "int-settings-b";
const named = (what: string) => `[int] ${what}`;

afterAll(async () => {
  await db.delete(connections).where(inArray(connections.workspaceId, [A, B]));
});

const rawRow = async (id: string) => (await db.select().from(connections).where(eq(connections.id, id)))[0];
const secretOf = async (ws: string, id: string) => (await listEnabledConnectionsWithSecrets(ws)).find((c) => c.id === id);
const edit = { name: "int renamed", url: "https://example.com/renamed", transport: "http" as const };

describe.skipIf(!process.env.DATABASE_URL)("connections store", () => {
  describe("tokens at rest", () => {
    it("stores a token encrypted: the plain column stays empty and token_enc does not contain it", async () => {
      const added = await addConnection(A, { name: named("with token"), url: "https://example.com/mcp", transport: "http", token: "secret-value" });
      const row = await rawRow(added.id);
      expect(row.token).toBeNull();
      expect(row.tokenEnc).toMatch(/^v1:/);
      expect(row.tokenEnc).not.toContain("secret-value");
      expect(row.authType).toBe("bearer");
    });

    it("answers hasToken and never the token itself", async () => {
      const added = await addConnection(A, { name: named("answer"), url: "https://example.com/mcp", transport: "http", token: "secret-value" });
      expect(added.hasToken).toBe(true);
      expect("token" in added).toBe(false);
      expect(JSON.stringify(added)).not.toContain("secret-value");
      const listed = (await listConnections(A)).find((c) => c.id === added.id);
      expect(listed!.hasToken).toBe(true);
      expect("token" in listed!).toBe(false);
    });

    it("decrypts the token for the agent's view", async () => {
      const added = await addConnection(A, { name: named("decrypt"), url: "https://example.com/mcp", transport: "http", token: "secret-value" });
      expect((await secretOf(A, added.id))!.token).toBe("secret-value");
    });

    it("still reads the plain token of a row written before encryption", async () => {
      const [legacy] = await db
        .insert(connections)
        .values({ workspaceId: A, name: named("legacy"), url: "https://example.com/legacy", token: "legacy-value" })
        .returning();
      expect((await secretOf(A, legacy.id))!.token).toBe("legacy-value");
      expect((await listConnections(A)).find((c) => c.id === legacy.id)!.authType).toBe("bearer");
    });

    it("adds a server with no token as enabled, with no status yet and no sign-in", async () => {
      const added = await addConnection(A, { name: named("no token"), url: "https://example.com/open", transport: "sse" });
      expect(added).toMatchObject({ hasToken: false, enabled: true, transport: "sse", lastStatus: null, authType: "none" });
    });
  });

  describe("updateConnection", () => {
    it("keeps the saved token when no new one is typed", async () => {
      const added = await addConnection(A, { name: named("keep"), url: "https://example.com/keep", transport: "http", token: "secret-value" });
      const updated = await updateConnection(A, added.id, { ...edit, authType: "bearer" });
      expect(updated).toMatchObject({ name: "int renamed", url: "https://example.com/renamed", hasToken: true });
      expect((await secretOf(A, added.id))!.token).toBe("secret-value");
    });

    it("replaces the token when a new one is typed, still encrypted", async () => {
      const added = await addConnection(A, { name: named("replace"), url: "https://example.com/r", transport: "http", token: "secret-value" });
      await updateConnection(A, added.id, { ...edit, authType: "bearer", token: "new-value" });
      const row = await rawRow(added.id);
      expect(row.token).toBeNull();
      expect(row.tokenEnc).not.toContain("new-value");
      expect((await secretOf(A, added.id))!.token).toBe("new-value");
    });

    it("removes the token when clearToken is set", async () => {
      const added = await addConnection(A, { name: named("clear"), url: "https://example.com/c", transport: "http", token: "secret-value" });
      const updated = await updateConnection(A, added.id, { ...edit, authType: "bearer", clearToken: true });
      expect(updated.hasToken).toBe(false);
      expect((await rawRow(added.id)).tokenEnc).toBeNull();
    });

    it("removes the token when the server is switched to no sign-in, so no stale token is ever sent", async () => {
      const added = await addConnection(A, { name: named("to none"), url: "https://example.com/n", transport: "http", token: "secret-value" });
      const updated = await updateConnection(A, added.id, { ...edit, authType: "none" });
      expect(updated).toMatchObject({ authType: "none", hasToken: false });
    });

    it("refuses an address on a private network and leaves the row as it was", async () => {
      const added = await addConnection(A, { name: named("private"), url: "https://example.com/p", transport: "http" });
      await expect(updateConnection(A, added.id, { ...edit, url: "http://169.254.169.254/latest" })).rejects.toThrow(/private or local network/);
      expect((await rawRow(added.id)).url).toBe("https://example.com/p");
    });
  });

  describe("toggle, delete and OAuth state", () => {
    it("setConnectionEnabled flips a connection off and on again", async () => {
      const added = await addConnection(A, { name: named("toggle"), url: "https://example.com/toggle", transport: "http" });
      await setConnectionEnabled(A, added.id, false);
      expect((await listConnections(A)).find((c) => c.id === added.id)!.enabled).toBe(false);
      await setConnectionEnabled(A, added.id, true);
      expect((await listConnections(A)).find((c) => c.id === added.id)!.enabled).toBe(true);
    });

    it("leaves a disabled connection out of the agent's view", async () => {
      const added = await addConnection(A, { name: named("disabled"), url: "https://example.com/d", transport: "http", token: "secret-value" });
      await setConnectionEnabled(A, added.id, false);
      expect(await secretOf(A, added.id)).toBeUndefined();
    });

    it("deleteConnection removes the connection", async () => {
      const added = await addConnection(A, { name: named("delete"), url: "https://example.com/del", transport: "http" });
      await deleteConnection(A, added.id);
      expect(await rawRow(added.id)).toBeUndefined();
    });

    it("setConnectionOAuth stores the sign-in state exactly as given, and the list then says signed in", async () => {
      const added = await addConnection(A, { name: named("oauth"), url: "https://example.com/o", transport: "http", authType: "oauth" });
      expect(added).toMatchObject({ authType: "oauth", signedIn: false });
      const state = blob({ tokens: { accessTokenEnc: "v1:sealed", refreshTokenEnc: null, expiresAt: null } });
      await setConnectionOAuth(A, added.id, state);
      expect((await rawRow(added.id)).oauth).toEqual(state);
      expect((await listConnections(A)).find((c) => c.id === added.id)!.signedIn).toBe(true);
    });

    it("says the connection needs a sign-in again once the oauth module marks it so", async () => {
      const added = await addConnection(A, { name: named("oauth again"), url: "https://example.com/o2", transport: "http", authType: "oauth" });
      await setConnectionOAuth(A, added.id, blob({ tokens: null, needsSignIn: true }));
      expect((await listConnections(A)).find((c) => c.id === added.id)!.signedIn).toBe(false);
    });
  });

  describe("workspace isolation: another workspace's id changes nothing", () => {
    it("lists none of another workspace's connections", async () => {
      const added = await addConnection(A, { name: named("private list"), url: "https://example.com/pl", transport: "http", token: "secret-value" });
      expect((await listConnections(B)).map((c) => c.id)).not.toContain(added.id);
      expect(await secretOf(B, added.id)).toBeUndefined();
    });

    it("refuses to update another workspace's connection and leaves it as it was", async () => {
      const added = await addConnection(A, { name: named("iso update"), url: "https://example.com/iu", transport: "http", token: "secret-value" });
      await expect(updateConnection(B, added.id, { ...edit, authType: "none" })).rejects.toThrow(/could not be found/);
      const row = await rawRow(added.id);
      expect(row.name).toBe(named("iso update"));
      expect((await secretOf(A, added.id))!.token).toBe("secret-value");
    });

    it("does not delete another workspace's connection", async () => {
      const added = await addConnection(A, { name: named("iso delete"), url: "https://example.com/id", transport: "http" });
      await deleteConnection(B, added.id);
      expect(await rawRow(added.id)).toBeDefined();
    });

    it("does not toggle another workspace's connection", async () => {
      const added = await addConnection(A, { name: named("iso toggle"), url: "https://example.com/it", transport: "http" });
      await setConnectionEnabled(B, added.id, false);
      expect((await rawRow(added.id)).enabled).toBe(true);
    });

    it("does not write OAuth state into another workspace's connection", async () => {
      const added = await addConnection(A, { name: named("iso oauth"), url: "https://example.com/io", transport: "http", authType: "oauth" });
      await setConnectionOAuth(B, added.id, blob({ tokens: { accessTokenEnc: "v1:forged", refreshTokenEnc: null, expiresAt: null } }));
      expect((await rawRow(added.id)).oauth).toBeNull();
    });
  });
});

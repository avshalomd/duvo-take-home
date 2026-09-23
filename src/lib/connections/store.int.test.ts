// The connections store against the real table. `npm run test:int`. The database is shared with other agents, so
// everything here lives in two workspaces of its own ("int-settings-a", "int-settings-b") and is deleted afterwards.
import { afterAll, describe, expect, it, vi } from "vitest";
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

// One name resolves inside our network, as a rebinding attacker's would; every other name is looked up for real.
vi.mock("node:dns/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:dns/promises")>();
  const lookup = (async (host: string, options: object) =>
    host === "int-rebind.example.com" ? [{ address: "10.0.0.7", family: 4 }] : real.lookup(host, options as never)) as typeof real.lookup;
  return { ...real, lookup, default: { ...real, lookup } };
});

const A = "int-settings-a"; // tenancy: every call names the workspace, as the session would
const B = "int-settings-b";
// Not "[int] ...": the oauth package's integration tests delete every "[int]%" connection in any workspace when they
// finish, and test files run in parallel, so rows named that way vanished mid-test. These are found by workspace.
const named = (what: string) => `int-settings ${what}`;

afterAll(async () => {
  await db.delete(connections).where(inArray(connections.workspaceId, [A, B]));
});

const rawRow = async (id: string) => (await db.select().from(connections).where(eq(connections.id, id)))[0];
const secretOf = async (ws: string, id: string) => (await listEnabledConnectionsWithSecrets(ws)).find((c) => c.id === id);
// Each edit gets a name of its own: two connections of a workspace may not share a name's key (Q126).
let renames = 0;
const edited = () => ({ name: `int renamed ${++renames}`, url: "https://example.com/renamed", transport: "http" as const });

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
      const updated = await updateConnection(A, added.id, { ...edited(), authType: "bearer" });
      expect(updated).toMatchObject({ name: expect.stringMatching(/^int renamed \d+$/), url: "https://example.com/renamed", hasToken: true });
      expect((await secretOf(A, added.id))!.token).toBe("secret-value");
    });

    it("replaces the token when a new one is typed, still encrypted", async () => {
      const added = await addConnection(A, { name: named("replace"), url: "https://example.com/r", transport: "http", token: "secret-value" });
      await updateConnection(A, added.id, { ...edited(), authType: "bearer", token: "new-value" });
      const row = await rawRow(added.id);
      expect(row.token).toBeNull();
      expect(row.tokenEnc).not.toContain("new-value");
      expect((await secretOf(A, added.id))!.token).toBe("new-value");
    });

    it("removes the token when clearToken is set", async () => {
      const added = await addConnection(A, { name: named("clear"), url: "https://example.com/c", transport: "http", token: "secret-value" });
      const updated = await updateConnection(A, added.id, { ...edited(), authType: "bearer", clearToken: true });
      expect(updated.hasToken).toBe(false);
      expect((await rawRow(added.id)).tokenEnc).toBeNull();
    });

    it("removes the token when the server is switched to no sign-in, so no stale token is ever sent", async () => {
      const added = await addConnection(A, { name: named("to none"), url: "https://example.com/n", transport: "http", token: "secret-value" });
      const updated = await updateConnection(A, added.id, { ...edited(), authType: "none" });
      expect(updated).toMatchObject({ authType: "none", hasToken: false });
    });

    it("refuses an address on a private network and leaves the row as it was", async () => {
      const added = await addConnection(A, { name: named("private"), url: "https://example.com/p", transport: "http" });
      await expect(updateConnection(A, added.id, { ...edited(), url: "http://169.254.169.254/latest" })).rejects.toThrow(/private or local network/);
      expect((await rawRow(added.id)).url).toBe("https://example.com/p");
    });
  });

  // Security QA: the contract reads the address as typed; a name is looked up before the row is written.
  describe("an address whose name resolves to a private network", () => {
    it("refuses to add it, and saves nothing", async () => {
      const input = { name: named("rebind add"), url: "https://int-rebind.example.com/mcp", transport: "http" as const };
      await expect(addConnection(A, input)).rejects.toThrow(/private or local network/);
      expect((await listConnections(A)).map((c) => c.name)).not.toContain(named("rebind add"));
    });

    it("refuses to move a connection there, and leaves the row as it was", async () => {
      const added = await addConnection(A, { name: named("rebind edit"), url: "https://example.com/r", transport: "http" });
      await expect(updateConnection(A, added.id, { ...edited(), url: "https://int-rebind.example.com/mcp" })).rejects.toThrow(/private or local network/);
      expect((await rawRow(added.id)).url).toBe("https://example.com/r");
    });

    it("still saves a name that does not resolve yet: every run looks it up again before using it", async () => {
      const added = await addConnection(A, { name: named("not yet"), url: "https://int-not-yet.example/mcp", transport: "http" });
      expect(added.url).toBe("https://int-not-yet.example/mcp");
    });
  });

  // Q80: the saved credentials belong to the server they were given for. Pointing a connection somewhere else with the
  // token field left empty must not send the old token (or the OAuth access token) to the new address.
  describe("a new address", () => {
    const signedIn = () => blob({ tokens: { accessTokenEnc: "v1:sealed", refreshTokenEnc: null, expiresAt: null } });

    it("clears the saved token when the host changes, even with the token field left empty", async () => {
      const added = await addConnection(A, { name: named("moved"), url: "https://example.com/mcp", transport: "http", token: "secret-value" });
      const updated = await updateConnection(A, added.id, { ...edited(), url: "https://attacker.example/mcp", authType: "bearer" });
      expect(updated.hasToken).toBe(false);
      const row = await rawRow(added.id);
      expect(row.tokenEnc).toBeNull();
      expect(row.token).toBeNull();
      expect((await secretOf(A, added.id))!.token).toBeNull();
    });

    it("clears a legacy plain token too when the host changes", async () => {
      const [legacy] = await db
        .insert(connections)
        .values({ workspaceId: A, name: named("legacy moved"), url: "https://example.com/legacy", token: "legacy-value" })
        .returning();
      await updateConnection(A, legacy.id, { ...edited(), url: "https://attacker.example/mcp", authType: "bearer" });
      expect((await rawRow(legacy.id)).token).toBeNull();
    });

    it("clears the OAuth sign-in when the host changes, so the new server needs its own sign-in", async () => {
      const added = await addConnection(A, { name: named("oauth moved"), url: "https://example.com/o", transport: "http", authType: "oauth" });
      await setConnectionOAuth(A, added.id, signedIn());
      const updated = await updateConnection(A, added.id, { ...edited(), url: "https://attacker.example/mcp", authType: "oauth" });
      expect(updated.signedIn).toBe(false);
      expect((await rawRow(added.id)).oauth).toBeNull();
    });

    it("clears the saved token when https becomes http on the same host", async () => {
      const added = await addConnection(A, { name: named("downgrade"), url: "https://example.com/mcp", transport: "http", token: "secret-value" });
      const updated = await updateConnection(A, added.id, { ...edited(), url: "http://example.com/mcp", authType: "bearer" });
      expect(updated.hasToken).toBe(false);
    });

    it("saves a new token pasted along with the new host", async () => {
      const added = await addConnection(A, { name: named("moved new"), url: "https://example.com/mcp", transport: "http", token: "secret-value" });
      await updateConnection(A, added.id, { ...edited(), url: "https://other.example/mcp", authType: "bearer", token: "new-value" });
      expect((await secretOf(A, added.id))!.token).toBe("new-value");
    });

    it("keeps the token and the OAuth sign-in when only the path changes on the same host", async () => {
      const bearer = await addConnection(A, { name: named("same host"), url: "https://example.com/mcp", transport: "http", token: "secret-value" });
      await updateConnection(A, bearer.id, { ...edited(), url: "https://example.com/v2/mcp", authType: "bearer" });
      expect((await secretOf(A, bearer.id))!.token).toBe("secret-value");

      const oauth = await addConnection(A, { name: named("same host oauth"), url: "https://example.com/o", transport: "http", authType: "oauth" });
      await setConnectionOAuth(A, oauth.id, signedIn());
      const updated = await updateConnection(A, oauth.id, { ...edited(), url: "https://example.com/o/v2", authType: "oauth" });
      expect(updated.signedIn).toBe(true);
    });
  });

  // Q126: a run registers each server under connectionKey(name), so two names with one key would let one server
  // silently replace the other. The second name is refused, naming the connection that already has it.
  describe("names that would collide in a run", () => {
    it("refuses a second server with the same name", async () => {
      await addConnection(A, { name: "QA Bearer", url: "https://example.com/qa1", transport: "http" });
      await expect(addConnection(A, { name: "QA Bearer", url: "https://example.com/qa2", transport: "http" })).rejects.toThrow(
        "That name is already used by QA Bearer",
      );
    });

    it("refuses a name that differs only in case, spaces or punctuation", async () => {
      await addConnection(A, { name: "QA-Clash", url: "https://example.com/qa3", transport: "http" });
      await expect(addConnection(A, { name: "qa clash", url: "https://example.com/qa4", transport: "http" })).rejects.toThrow(
        "That name is already used by QA-Clash",
      );
      expect((await listConnections(A)).filter((c) => c.name.toLowerCase().replace(/\W/g, "") === "qaclash")).toHaveLength(1);
    });

    it("allows the same name in another workspace", async () => {
      await addConnection(A, { name: "QA Shared", url: "https://example.com/qa5", transport: "http" });
      await expect(addConnection(B, { name: "QA Shared", url: "https://example.com/qa6", transport: "http" })).resolves.toMatchObject({ name: "QA Shared" });
    });

    it("refuses to rename a server to a name another one has, and leaves it as it was", async () => {
      await addConnection(A, { name: "QA Taken", url: "https://example.com/qa7", transport: "http" });
      const other = await addConnection(A, { name: "QA Other", url: "https://example.com/qa8", transport: "http" });
      await expect(updateConnection(A, other.id, { name: "QA_Taken", url: "https://example.com/qa8", transport: "http" })).rejects.toThrow(
        "That name is already used by QA Taken",
      );
      expect((await rawRow(other.id)).name).toBe("QA Other");
    });

    it("lets a server keep its own name when something else is edited", async () => {
      const own = await addConnection(A, { name: "QA Own", url: "https://example.com/qa9", transport: "http" });
      await expect(updateConnection(A, own.id, { name: "QA Own", url: "https://example.com/qa9/v2", transport: "http" })).resolves.toMatchObject({
        name: "QA Own",
      });
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
      await expect(updateConnection(B, added.id, { ...edited(), authType: "none" })).rejects.toThrow(/could not be found/);
      const row = await rawRow(added.id);
      expect(row.name).toBe(named("iso update"));
      expect((await secretOf(A, added.id))!.token).toBe("secret-value");
    });

    // Security QA: these used to succeed silently, so the page said "done" while nothing had changed.
    it("does not delete another workspace's connection, and says it was not found", async () => {
      const added = await addConnection(A, { name: named("iso delete"), url: "https://example.com/id", transport: "http" });
      await expect(deleteConnection(B, added.id)).rejects.toThrow(/could not be found/);
      expect(await rawRow(added.id)).toBeDefined();
    });

    it("does not toggle another workspace's connection, and says it was not found", async () => {
      const added = await addConnection(A, { name: named("iso toggle"), url: "https://example.com/it", transport: "http" });
      await expect(setConnectionEnabled(B, added.id, false)).rejects.toThrow(/could not be found/);
      expect((await rawRow(added.id)).enabled).toBe(true);
    });

    it("says a connection deleted meanwhile was not found, when it is toggled or deleted again", async () => {
      const added = await addConnection(A, { name: named("gone"), url: "https://example.com/gone", transport: "http" });
      await deleteConnection(A, added.id);
      await expect(deleteConnection(A, added.id)).rejects.toThrow(/could not be found/);
      await expect(setConnectionEnabled(A, added.id, true)).rejects.toThrow(/could not be found/);
    });

    it("does not write OAuth state into another workspace's connection", async () => {
      const added = await addConnection(A, { name: named("iso oauth"), url: "https://example.com/io", transport: "http", authType: "oauth" });
      await setConnectionOAuth(B, added.id, blob({ tokens: { accessTokenEnc: "v1:forged", refreshTokenEnc: null, expiresAt: null } }));
      expect((await rawRow(added.id)).oauth).toBeNull();
    });
  });
});

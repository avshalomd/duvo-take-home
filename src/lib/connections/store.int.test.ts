// The connections store against the real table. `npm run test:int`. Everything it creates is named "[int] ..." and deleted.
import { afterAll, describe, expect, it } from "vitest";
import { like } from "drizzle-orm";
import { db } from "@/db";
import { connections } from "@/db/schema";
import { addConnection, listConnections, listEnabledConnectionsWithSecrets, setConnectionEnabled } from "./store";

const PREFIX = "[int]";
const WS = "int-test-workspace"; // tenancy: every call names the workspace, as the session would
const named = (what: string) => `${PREFIX} ${what}`;

afterAll(async () => {
  await db.delete(connections).where(like(connections.name, `${PREFIX}%`));
});

describe.skipIf(!process.env.DATABASE_URL)("connections store", () => {
  it("addConnection with a token answers hasToken true and never the token itself", async () => {
    const added = await addConnection(WS, {
      name: named("with token"),
      url: "https://example.com/mcp",
      transport: "http",
      token: "secret-value",
    });
    expect(added.hasToken).toBe(true);
    expect("token" in added).toBe(false);
    expect(JSON.stringify(added)).not.toContain("secret-value");
  });

  it("addConnection without a token answers hasToken false, enabled and no status yet", async () => {
    const added = await addConnection(WS, {
      name: named("no token"),
      url: "https://example.com/open",
      transport: "sse",
    });
    expect(added.hasToken).toBe(false);
    expect(added.enabled).toBe(true);
    expect(added.transport).toBe("sse");
    expect(added.lastStatus).toBeNull();
  });

  it("listConnections shows the added row with hasToken and no token field", async () => {
    const added = await addConnection(WS, {
      name: named("listed"),
      url: "https://example.com/listed",
      transport: "http",
      token: "secret-value",
    });
    const row = (await listConnections(WS)).find((c) => c.id === added.id);
    expect(row).toBeDefined();
    expect(row!.hasToken).toBe(true);
    expect("token" in row!).toBe(false);
  });

  it("setConnectionEnabled flips a connection off and on again", async () => {
    const added = await addConnection(WS, { name: named("toggle"), url: "https://example.com/toggle", transport: "http" });
    await setConnectionEnabled(WS, added.id, false);
    const off = (await listConnections(WS)).find((c) => c.id === added.id);
    expect(off!.enabled).toBe(false);

    await setConnectionEnabled(WS, added.id, true);
    const on = (await listConnections(WS)).find((c) => c.id === added.id);
    expect(on!.enabled).toBe(true);
  });

  it("listEnabledConnectionsWithSecrets carries the token, which is what the agent's mcpServers needs", async () => {
    const added = await addConnection(WS, {
      name: named("secret"),
      url: "https://example.com/secret",
      transport: "http",
      token: "secret-value",
    });
    const row = (await listEnabledConnectionsWithSecrets(WS)).find((c) => c.id === added.id);
    expect(row).toBeDefined();
    expect(row!.token).toBe("secret-value");
    expect(row!.hasToken).toBe(true);
  });

  it("listEnabledConnectionsWithSecrets leaves out a disabled connection", async () => {
    const added = await addConnection(WS, {
      name: named("disabled"),
      url: "https://example.com/disabled",
      transport: "http",
      token: "secret-value",
    });
    await setConnectionEnabled(WS, added.id, false);
    const ids = (await listEnabledConnectionsWithSecrets(WS)).map((c) => c.id);
    expect(ids).not.toContain(added.id);
  });

  it("deletes everything it created", async () => {
    await db.delete(connections).where(like(connections.name, `${PREFIX}%`));
    const left = (await listConnections(WS)).filter((c) => c.name.startsWith(PREFIX));
    expect(left).toHaveLength(0);
  });
});

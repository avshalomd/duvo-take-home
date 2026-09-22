import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Connection, NewConnection, Transport } from "./connection";
import {
  addConnection,
  listConnections,
  listEnabledConnectionsWithSecrets,
  setConnectionEnabled,
} from "../lib/connections/store";
import connectionsFixture from "../../fixtures/connections.json";

type FixtureConnection = {
  id: string;
  name: string;
  url: string | null;
  transport: string;
  enabled: boolean;
  last_status: string | null;
};
const fixtureConnections = connectionsFixture as unknown as FixtureConnection[];

/** The same object without one key, so a rejection names that key and nothing else. */
function omit<T extends object>(value: T, key: keyof T & string) {
  const copy = { ...value } as Record<string, unknown>;
  delete copy[key];
  return copy;
}

describe("Transport", () => {
  it("accepts the http transports in the fixture", () => {
    const http = fixtureConnections.filter((c) => c.transport === "http");
    expect(http.length).toBeGreaterThan(0);
    for (const c of http) expect(Transport.parse(c.transport)).toBe("http");
  });

  it("accepts sse, the other remote transport", () => {
    expect(Transport.parse("sse")).toBe("sse");
  });

  it("rejects the fixture's sdk transport, which is an in-process server and not a connection", () => {
    const sdk = fixtureConnections.find((c) => c.transport === "sdk");
    expect(sdk).toBeDefined();
    expect(Transport.safeParse("sdk").success).toBe(false);
  });
});

describe("Connection", () => {
  it("accepts every connection the store builds from the fixture", async () => {
    const connections = await listConnections();
    expect(connections.length).toBeGreaterThan(0);
    for (const c of connections) expect(Connection.parse(c).id).toBe(c.id);
  });

  it("never carries the token itself, only hasToken", async () => {
    const [first] = await listConnections();
    expect(typeof first.hasToken).toBe("boolean");
    expect("token" in Connection.parse(first)).toBe(false);
  });

  it("rejects a connection whose url has no scheme", async () => {
    const [first] = await listConnections();
    expect(Connection.safeParse({ ...first, url: "mcp.deepwiki.com/mcp" }).success).toBe(false);
  });

  it("rejects a connection whose hasToken is a string", async () => {
    const [first] = await listConnections();
    expect(Connection.safeParse({ ...first, hasToken: "yes" }).success).toBe(false);
  });

  it("rejects a connection whose lastStatus is missing rather than null", async () => {
    const [first] = await listConnections();
    expect(Connection.safeParse(omit(first, "lastStatus")).success).toBe(false);
  });
});

describe("NewConnection", () => {
  it("accepts what the add form sends for the fixture's DeepWiki server", () => {
    const fixture = fixtureConnections.find((c) => c.id === "conn_deepwiki");
    if (!fixture) throw new Error("fixtures/connections.json has no conn_deepwiki");
    const parsed = NewConnection.parse({
      name: fixture.name,
      url: fixture.url,
      transport: fixture.transport,
      token: "",
    });
    expect(parsed.name).toBe("DeepWiki");
    expect(parsed.transport).toBe("http");
  });

  it("defaults the transport to http when the form does not send one", () => {
    const parsed = NewConnection.parse({ name: "DeepWiki", url: "https://mcp.deepwiki.com/mcp" });
    expect(parsed.transport).toBe("http");
    expect(parsed.token).toBeUndefined();
  });

  it("rejects a name with parentheses, which the fixture's \"GitHub (read-only)\" has", () => {
    // The name becomes the mcp__<key>__ prefix, so the regex is letters, digits, space, - and _ only.
    expect(NewConnection.safeParse({ name: "GitHub (read-only)", url: "https://api.githubcopilot.com/mcp/readonly" }).success).toBe(false);
  });

  it("rejects an empty name", () => {
    expect(NewConnection.safeParse({ name: "   ", url: "https://mcp.deepwiki.com/mcp" }).success).toBe(false);
  });

  it("rejects a url that is a hostname, not a full URL", () => {
    expect(NewConnection.safeParse({ name: "DeepWiki", url: "mcp.deepwiki.com" }).success).toBe(false);
  });

  it("rejects a transport of stdio: only remote servers can be added", () => {
    expect(NewConnection.safeParse({ name: "DeepWiki", url: "https://mcp.deepwiki.com/mcp", transport: "stdio" }).success).toBe(false);
  });
});

describe("the connection stubs", () => {
  it("listConnections answers an array of Connection, and drops the sdk-transport row", async () => {
    const connections = z.array(Connection).parse(await listConnections());
    const remote = fixtureConnections.filter((c) => c.transport === "http" || c.transport === "sse");
    expect(connections).toHaveLength(remote.length);
  });

  it("listEnabledConnectionsWithSecrets answers Connections that also carry a token field", async () => {
    const secrets = await listEnabledConnectionsWithSecrets();
    expect(secrets.length).toBeGreaterThan(0);
    for (const secret of secrets) {
      Connection.parse(secret);
      expect(secret.enabled).toBe(true);
      expect("token" in secret).toBe(true);
    }
  });

  it("setConnectionEnabled is not implemented yet and says so", async () => {
    await expect(setConnectionEnabled("conn_github", true)).rejects.toThrow("not implemented: setConnectionEnabled");
  });

  it("addConnection is not implemented yet and says so", async () => {
    await expect(
      addConnection({ name: "DeepWiki", url: "https://mcp.deepwiki.com/mcp", transport: "http" }),
    ).rejects.toThrow("not implemented: addConnection");
  });
});

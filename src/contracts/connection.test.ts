import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Connection, NewConnection, Transport } from "./connection";
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
  // Built from the fixture, not the store: the store is Drizzle on the connections table since P4 landed.
  const fixture = connectionsFixture.filter((c) => c.transport === "http" || c.transport === "sse");
  const toConnection = (c: (typeof fixture)[number]) => ({
    id: c.id, name: c.name, url: c.url as string, transport: c.transport as "http" | "sse",
    hasToken: false, enabled: c.enabled, lastStatus: c.last_status ?? null,
  });
  const first = toConnection(fixture[0]);

  it("accepts every http/sse connection in the fixture", () => {
    expect(fixture.length).toBeGreaterThan(0);
    for (const c of fixture) expect(Connection.parse(toConnection(c)).id).toBe(c.id);
  });

  it("never carries the token itself, only hasToken", () => {
    expect("token" in Connection.parse(first)).toBe(false);
  });

  it("rejects a connection whose url has no scheme", () => {
    expect(Connection.safeParse({ ...first, url: "mcp.deepwiki.com/mcp" }).success).toBe(false);
  });

  it("rejects a connection whose hasToken is a string", () => {
    expect(Connection.safeParse({ ...first, hasToken: "yes" }).success).toBe(false);
  });

  it("rejects a connection whose lastStatus is missing rather than null", () => {
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

  it('rejects a name with parentheses, which the fixture\'s "GitHub (read-only)" has', () => {
    // The name becomes the mcp__<key>__ prefix, so the regex is letters, digits, space, - and _ only.
    expect(
      NewConnection.safeParse({
        name: "GitHub (read-only)",
        url: "https://api.githubcopilot.com/mcp/readonly",
      }).success,
    ).toBe(false);
  });

  it("rejects an empty name", () => {
    expect(NewConnection.safeParse({ name: "   ", url: "https://mcp.deepwiki.com/mcp" }).success).toBe(false);
  });

  it("rejects a url that is a hostname, not a full URL", () => {
    expect(NewConnection.safeParse({ name: "DeepWiki", url: "mcp.deepwiki.com" }).success).toBe(false);
  });

  it("rejects a transport of stdio: only remote servers can be added", () => {
    expect(
      NewConnection.safeParse({ name: "DeepWiki", url: "https://mcp.deepwiki.com/mcp", transport: "stdio" })
        .success,
    ).toBe(false);
  });
});

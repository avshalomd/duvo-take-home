// How a connections row becomes what the UI sees (Connection) and what the agent gets (the token), without a database.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { connections } from "@/db/schema";
import { encryptSecret } from "./crypto";
import { blob } from "./oauth/fake-store";
import { readToken, toConnection } from "./store-map";

type Row = typeof connections.$inferSelect;
const TOKENS = { accessTokenEnc: "v1:sealed-access", refreshTokenEnc: null, expiresAt: null }; // the oauth module seals them; only their presence counts here
const saved = process.env.CONNECTION_KEY;
beforeAll(() => {
  process.env.CONNECTION_KEY = randomBytes(32).toString("base64");
});
afterAll(() => {
  process.env.CONNECTION_KEY = saved;
});

const row = (over: Partial<Row> = {}): Row => ({
  id: "3b368c9a-231d-4fb5-874c-add3059f9c41",
  workspaceId: "ws-a",
  authType: "none",
  tokenEnc: null,
  oauth: null,
  tools: [],
  updatedAt: null,
  name: "GitHub",
  url: "https://api.githubcopilot.com/mcp/",
  transport: "http",
  token: null,
  enabled: true,
  lastStatus: null,
  createdAt: new Date("2026-09-23T08:00:00.000Z"),
  ...over,
});

describe("toConnection", () => {
  it("answers hasToken for an encrypted token and never carries the token", () => {
    const c = toConnection(row({ authType: "bearer", tokenEnc: encryptSecret("secret-value") }));
    expect(c.hasToken).toBe(true);
    expect("token" in c).toBe(false);
    expect(JSON.stringify(c)).not.toContain("v1:");
  });

  it("answers hasToken for a legacy plain token not yet re-encrypted", () => {
    expect(toConnection(row({ token: "secret-value" })).hasToken).toBe(true);
  });

  it("answers hasToken false when neither column holds one", () => {
    expect(toConnection(row()).hasToken).toBe(false);
  });

  it("reads a v1 row with a token as signing in with a token, though its auth_type says none", () => {
    expect(toConnection(row({ token: "secret-value", authType: "none" })).authType).toBe("bearer");
  });

  it("keeps the auth type the row states", () => {
    expect(toConnection(row({ authType: "oauth" })).authType).toBe("oauth");
    expect(toConnection(row()).authType).toBe("none");
  });

  it("says signedIn only for an OAuth connection, reading its state as the oauth module does", () => {
    expect(toConnection(row({ authType: "oauth", oauth: blob({ tokens: TOKENS }) })).signedIn).toBe(true);
    expect(toConnection(row({ authType: "bearer", tokenEnc: encryptSecret("x") })).signedIn).toBeUndefined();
  });

  it("is not signed in before the first sign-in: no state, or a registration without tokens", () => {
    expect(toConnection(row({ authType: "oauth", oauth: null })).signedIn).toBe(false);
    expect(toConnection(row({ authType: "oauth", oauth: blob() })).signedIn).toBe(false);
  });

  it("is not signed in once the service refused a refresh and the person has to sign in again", () => {
    expect(toConnection(row({ authType: "oauth", oauth: blob({ tokens: TOKENS, needsSignIn: true }) })).signedIn).toBe(false);
  });

  it("is not signed in when the stored state is not the oauth module's shape", () => {
    expect(toConnection(row({ authType: "oauth", oauth: { tokens: "something" } })).signedIn).toBe(false);
  });

  it("lists the tools the last run saw, and none before any run", () => {
    expect(toConnection(row({ tools: ["ask_question", "read_wiki_structure"] })).tools).toEqual(["ask_question", "read_wiki_structure"]);
    expect(toConnection(row()).tools).toEqual([]);
  });

  it("reads an unknown transport as http rather than failing the whole list", () => {
    expect(toConnection(row({ transport: "stdio" })).transport).toBe("http");
  });
});

describe("readToken", () => {
  it("decrypts token_enc", () => {
    expect(readToken(row({ tokenEnc: encryptSecret("secret-value") }))).toBe("secret-value");
  });

  it("falls back to the plain token of a row not yet migrated", () => {
    expect(readToken(row({ token: "legacy-value" }))).toBe("legacy-value");
  });

  it("prefers token_enc when a row holds both", () => {
    expect(readToken(row({ token: "old", tokenEnc: encryptSecret("new") }))).toBe("new");
  });

  it("answers null when there is no token", () => {
    expect(readToken(row())).toBeNull();
  });

  it("names the connection and the fix when its token cannot be read", () => {
    expect(() => readToken(row({ name: "GitHub", tokenEnc: "v1:AAAA:AAAA:AAAA" }))).toThrow(/GitHub.*paste the token again/i);
  });
});

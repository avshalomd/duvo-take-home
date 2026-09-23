// authHeaders: what the agent's MCP client sends to each enabled connection before a run. A bearer token as in
// v1; for OAuth the access token, refreshed when it expires within a minute, or nothing when sign-in is needed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionSecret } from "@/contracts/connection";
import { AS_URL, MCP_URL, type Call, fakeFetch, json, network } from "./fake-server";
import { CONNECTION_ID, addRow, blob, resetRows, rows, seal, unseal } from "./fake-store";
import { authHeaders } from "./headers";
import type { OAuthBlob } from "./shape";

vi.mock("./rows", async () => (await import("./fake-store")).rowsModule);
vi.mock("@/lib/connections/store", async () => (await import("./fake-store")).storeModule);
vi.mock("@/lib/connections/crypto", async () => (await import("./fake-store")).cryptoModule);
vi.mock("./fetch", async () => (await import("./fake-server")).fetchModule);

const NOW = new Date("2026-09-23T10:00:00.000Z");
const inSeconds = (s: number) => new Date(NOW.getTime() + s * 1000).toISOString();

function secret(over: Partial<ConnectionSecret> = {}): ConnectionSecret {
  return { id: CONNECTION_ID, name: "Linear", url: MCP_URL, transport: "http", hasToken: false, enabled: true, lastStatus: null, token: null, oauth: null, ...over };
}
/** An OAuth connection as the run sees it, with the same blob stored on its row. */
function oauthConnection(tokens: OAuthBlob["tokens"], over: Partial<OAuthBlob> = {}): ConnectionSecret {
  const oauth = blob({ tokens, ...over });
  addRow({ authType: "oauth", oauth });
  return secret({ authType: "oauth", oauth });
}
const signedIn = (expiresInSeconds: number, refresh: string | null = "rt-1") => ({
  accessTokenEnc: seal("at-1"),
  refreshTokenEnc: refresh ? seal(refresh) : null,
  expiresAt: inSeconds(expiresInSeconds),
});
const tokenCalls = (calls: Call[]) => calls.filter((c) => c.url === `${AS_URL}/token`);
const stored = () => rows.get(CONNECTION_ID)!.oauth as OAuthBlob;

let server: ReturnType<typeof fakeFetch>;
function refreshAnswers(respond: () => Response) {
  server = fakeFetch({ [`POST ${AS_URL}/token`]: respond });
  network.current = server;
}

beforeEach(() => {
  resetRows();
  refreshAnswers(() => json({ access_token: "at-2", refresh_token: "rt-2", expires_in: 3600, token_type: "Bearer" }));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("authHeaders", () => {
  it("sends a bearer connection's token", async () => {
    expect(await authHeaders(secret({ authType: "bearer", token: "tok-1", hasToken: true }))).toEqual({ Authorization: "Bearer tok-1" });
  });

  it("sends nothing for a connection without a token", async () => {
    expect(await authHeaders(secret({ authType: "none" }))).toBeUndefined();
  });

  it("sends an OAuth connection's access token while it is fresh, without calling the server", async () => {
    const c = oauthConnection(signedIn(5 * 60));

    expect(await authHeaders(c)).toEqual({ Authorization: "Bearer at-1" });
    expect(server.calls).toHaveLength(0);
  });

  it("refreshes a token that expires within a minute, sends the new one and stores the new tokens encrypted", async () => {
    const c = oauthConnection(signedIn(30));

    expect(await authHeaders(c)).toEqual({ Authorization: "Bearer at-2" });

    const body = new URLSearchParams(tokenCalls(server.calls)[0].body);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("rt-1");
    expect(body.get("resource")).toBe(MCP_URL);
    expect(unseal(stored().tokens!.accessTokenEnc)).toBe("at-2");
    expect(unseal(stored().tokens!.refreshTokenEnc!)).toBe("rt-2");
    expect(stored().tokens!.expiresAt).toBe(inSeconds(3600));
  });

  it("keeps the old refresh token when the server does not send a new one", async () => {
    refreshAnswers(() => json({ access_token: "at-2", expires_in: 3600, token_type: "Bearer" }));
    const c = oauthConnection(signedIn(30));

    await authHeaders(c);

    expect(unseal(stored().tokens!.refreshTokenEnc!)).toBe("rt-1");
  });

  it("sends nothing and marks the connection as needing sign-in when the server refuses the refresh", async () => {
    refreshAnswers(() => json({ error: "invalid_grant", error_description: "Refresh token revoked" }, 400));
    const c = oauthConnection(signedIn(30));

    expect(await authHeaders(c)).toBeUndefined();

    expect(stored().needsSignIn).toBe(true);
    expect(stored().tokens).toBeNull();
    expect(stored().client.clientId).toBe("client-1"); // the registration is kept, so signing in again is one click
  });

  it("uses the tokens another run stored when the refresh token was already rotated by that run", async () => {
    refreshAnswers(() => json({ error: "invalid_grant", error_description: "Refresh token already used" }, 400));
    const c = oauthConnection(signedIn(30));
    // Meanwhile a parallel run refreshed first and stored fresh tokens on the row.
    rows.get(CONNECTION_ID)!.oauth = blob({ tokens: { accessTokenEnc: seal("at-other"), refreshTokenEnc: seal("rt-other"), expiresAt: inSeconds(3600) } });

    expect(await authHeaders(c)).toEqual({ Authorization: "Bearer at-other" });
    expect(stored().needsSignIn).toBe(false);
  });

  it("keeps the tokens when the server is down during a refresh, and sends the old token while it still works", async () => {
    refreshAnswers(() => new Response("upstream unavailable", { status: 503 }));
    const c = oauthConnection(signedIn(30));

    expect(await authHeaders(c)).toEqual({ Authorization: "Bearer at-1" });
    expect(stored().needsSignIn).toBe(false);
    expect(unseal(stored().tokens!.refreshTokenEnc!)).toBe("rt-1");
  });

  it("sends nothing but keeps the tokens when the server is down and the old token has already expired", async () => {
    refreshAnswers(() => new Response("upstream unavailable", { status: 503 }));
    const c = oauthConnection(signedIn(-10));

    expect(await authHeaders(c)).toBeUndefined();
    expect(stored().needsSignIn).toBe(false);
    expect(stored().tokens).not.toBeNull();
  });

  it("marks a connection as needing sign-in when its token is expiring and there is no refresh token", async () => {
    const c = oauthConnection(signedIn(30, null));

    expect(await authHeaders(c)).toBeUndefined();
    expect(stored().needsSignIn).toBe(true);
    expect(server.calls).toHaveLength(0);
  });

  it("sends nothing for an OAuth connection that never finished signing in", async () => {
    const c = oauthConnection(null);

    expect(await authHeaders(c)).toBeUndefined();
    expect(server.calls).toHaveLength(0);
  });

  it("sends nothing for a connection already marked as needing sign-in, and does not try to refresh", async () => {
    const c = oauthConnection(signedIn(30), { needsSignIn: true });

    expect(await authHeaders(c)).toBeUndefined();
    expect(server.calls).toHaveLength(0);
  });
});

// completeOAuth: the callback's half. It finds the sign-in by its state, exchanges the code with the stored PKCE
// verifier, and stores the tokens encrypted. A state works once and for ten minutes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AS_URL, MCP_URL, REDIRECT, type Call, fakeFetch, json, network } from "./fake-server";
import { CONNECTION_ID, WS, addRow, blob, resetRows, rows, seal, unseal } from "./fake-store";
import { completeOAuth } from "./complete";
import { SignInError } from "./errors";
import type { OAuthBlob } from "./shape";

vi.mock("./rows", async () => (await import("./fake-store")).rowsModule);
vi.mock("@/lib/connections/store", async () => (await import("./fake-store")).storeModule);
vi.mock("@/lib/connections/crypto", async () => (await import("./fake-store")).cryptoModule);
vi.mock("./fetch", async () => (await import("./fake-server")).fetchModule);

const NOW = new Date("2026-09-23T10:00:00.000Z");
const STATE = "S".repeat(43);
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60 * 1000).toISOString();

/** A connection waiting for its callback: registered, with a pending sign-in started `startedMinutesAgo` ago. */
function waitingConnection(startedMinutesAgo = 1) {
  return addRow({ oauth: blob({ pending: { state: STATE, verifierEnc: seal("verifier-1"), createdAt: minutesAgo(startedMinutesAgo) } }) });
}
function tokenServer(respond: () => Response = () => json({ access_token: "at-1", refresh_token: "rt-1", expires_in: 3600, token_type: "Bearer" })) {
  return fakeFetch({ [`POST ${AS_URL}/token`]: respond });
}
const tokenCalls = (calls: Call[]) => calls.filter((c) => c.url === `${AS_URL}/token`);
const stored = () => rows.get(CONNECTION_ID)!.oauth as OAuthBlob;

beforeEach(() => {
  resetRows();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("completeOAuth", () => {
  it("exchanges the code with the stored PKCE verifier, the callback address and the resource", async () => {
    waitingConnection();
    const server = tokenServer();
    network.current = server;

    await completeOAuth({ code: "code-1", state: STATE, redirectUri: REDIRECT });

    const [call] = tokenCalls(server.calls);
    const body = new URLSearchParams(call.body);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("code-1");
    expect(body.get("code_verifier")).toBe("verifier-1");
    expect(body.get("redirect_uri")).toBe(REDIRECT);
    expect(body.get("resource")).toBe(MCP_URL);
    expect(body.get("client_id")).toBe("client-1"); // a public client names itself in the body
  });

  it("stores the tokens encrypted with their expiry, clears the pending sign-in and returns the connection", async () => {
    waitingConnection();
    network.current = tokenServer();

    const result = await completeOAuth({ code: "code-1", state: STATE, redirectUri: REDIRECT });

    expect(result).toEqual({ workspaceId: WS, connectionId: CONNECTION_ID });
    const saved = stored();
    expect(unseal(saved.tokens!.accessTokenEnc)).toBe("at-1");
    expect(unseal(saved.tokens!.refreshTokenEnc!)).toBe("rt-1");
    expect(saved.tokens!.expiresAt).toBe("2026-09-23T11:00:00.000Z");
    expect(saved.pending).toBeNull();
    expect(saved.needsSignIn).toBe(false);
    expect(JSON.stringify(saved)).not.toContain("at-1");
  });

  it("sets the connection's auth type to oauth", async () => {
    waitingConnection();
    network.current = tokenServer();

    await completeOAuth({ code: "code-1", state: STATE, redirectUri: REDIRECT });

    expect(rows.get(CONNECTION_ID)!.authType).toBe("oauth");
  });

  it("clears a needs-sign-in mark left by a refused refresh", async () => {
    addRow({ oauth: blob({ needsSignIn: true, pending: { state: STATE, verifierEnc: seal("verifier-1"), createdAt: minutesAgo(1) } }) });
    network.current = tokenServer();

    await completeOAuth({ code: "code-1", state: STATE, redirectUri: REDIRECT });

    expect(stored().needsSignIn).toBe(false);
  });

  it("works once: the same callback again is refused and the server is not asked twice", async () => {
    waitingConnection();
    const server = tokenServer();
    network.current = server;
    await completeOAuth({ code: "code-1", state: STATE, redirectUri: REDIRECT });

    const again = completeOAuth({ code: "code-1", state: STATE, redirectUri: REDIRECT });

    await expect(again).rejects.toBeInstanceOf(SignInError);
    await expect(again).rejects.toThrow("This sign-in link has expired or was already used; start the sign-in again");
    expect(tokenCalls(server.calls)).toHaveLength(1);
  });

  it("refuses a state no connection is waiting for, without asking the server", async () => {
    waitingConnection();
    const server = tokenServer();
    network.current = server;

    await expect(completeOAuth({ code: "code-1", state: "T".repeat(43), redirectUri: REDIRECT })).rejects.toThrow(
      "This sign-in link has expired or was already used; start the sign-in again",
    );
    expect(tokenCalls(server.calls)).toHaveLength(0);
    expect(stored().pending).not.toBeNull(); // someone else's guess does not cancel the real sign-in
  });

  it("refuses a sign-in started more than ten minutes ago, and clears it", async () => {
    waitingConnection(11);
    const server = tokenServer();
    network.current = server;

    await expect(completeOAuth({ code: "code-1", state: STATE, redirectUri: REDIRECT })).rejects.toThrow(
      "This sign-in link has expired or was already used; start the sign-in again",
    );
    expect(tokenCalls(server.calls)).toHaveLength(0);
    expect(stored().pending).toBeNull();
  });

  it("passes on the server's words when it refuses the code, and leaves no pending sign-in to retry with", async () => {
    waitingConnection();
    network.current = tokenServer(() => json({ error: "invalid_grant", error_description: "Authorization code expired" }, 400));

    const failed = completeOAuth({ code: "code-1", state: STATE, redirectUri: REDIRECT });

    await expect(failed).rejects.toBeInstanceOf(SignInError);
    await expect(failed).rejects.toThrow("The server did not accept the sign-in: Authorization code expired");
    expect(stored().pending).toBeNull();
    expect(stored().tokens).toBeNull();
  });
});

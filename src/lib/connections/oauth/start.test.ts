// startOAuth: discovery, our app's registration (RFC 7591), PKCE and state, then the URL the browser is sent to.
// The rows, the store and the crypto are in memory (fake-store); the network is a fake server (fake-server).
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AS_URL, MCP_URL, REDIRECT, fakeFetch, json, network, oauthServerRoutes } from "./fake-server";
import { CONNECTION_ID, WS, addRow, blob, resetRows, rows, unseal, writes } from "./fake-store";
import type { OAuthBlob } from "./shape";
import { SignInError } from "./errors";
import { startOAuth } from "./start";

vi.mock("./rows", async () => (await import("./fake-store")).rowsModule);
vi.mock("@/lib/connections/store", async () => (await import("./fake-store")).storeModule);
vi.mock("@/lib/connections/crypto", async () => (await import("./fake-store")).cryptoModule);
vi.mock("./fetch", async () => (await import("./fake-server")).fetchModule);

const NOW = new Date("2026-09-23T10:00:00.000Z");
const registered = { client_id: "client-new", client_secret: "shh-secret", redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_basic" };

function serverWithRegistration() {
  return fakeFetch({ ...oauthServerRoutes(), [`POST ${AS_URL}/register`]: () => json(registered, 201) });
}
const stored = () => rows.get(CONNECTION_ID)!.oauth as OAuthBlob;
const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

beforeEach(() => {
  resetRows();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("startOAuth", () => {
  it("returns the server's authorization URL with PKCE (S256), the state, the advertised scopes and the resource (RFC 8707)", async () => {
    addRow();
    network.current = serverWithRegistration();

    const { authorizeUrl } = await startOAuth(WS, CONNECTION_ID, REDIRECT);

    const url = new URL(authorizeUrl);
    expect(`${url.origin}${url.pathname}`).toBe(`${AS_URL}/authorize`);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-new");
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("read write");
    expect(url.searchParams.get("resource")).toBe(MCP_URL);
    expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("registers our app with the callback address and the grants it needs, when the connection has no registration", async () => {
    addRow();
    const server = serverWithRegistration();
    network.current = server;

    await startOAuth(WS, CONNECTION_ID, REDIRECT);

    const registration = server.calls.find((c) => c.url === `${AS_URL}/register`);
    expect(registration).toBeDefined();
    expect(JSON.parse(registration!.body)).toMatchObject({
      redirect_uris: [REDIRECT],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none", // the server lists "none", so we register as a public client using PKCE alone
    });
  });

  it("stores the registration, the state and the PKCE verifier on the connection, the secrets encrypted", async () => {
    addRow();
    network.current = serverWithRegistration();

    const { authorizeUrl } = await startOAuth(WS, CONNECTION_ID, REDIRECT);

    const url = new URL(authorizeUrl);
    const saved = stored();
    expect(writes.at(-1)?.workspaceId).toBe(WS);
    expect(saved.client).toMatchObject({ clientId: "client-new", redirectUri: REDIRECT, authorizationServerUrl: AS_URL, authMethod: "client_secret_basic" });
    expect(unseal(saved.client.clientSecretEnc!)).toBe("shh-secret");
    expect(saved.pending?.state).toBe(url.searchParams.get("state"));
    expect(saved.pending?.createdAt).toBe(NOW.toISOString());
    expect(s256(unseal(saved.pending!.verifierEnc))).toBe(url.searchParams.get("code_challenge")); // the stored verifier is the one the URL commits to
    expect(saved.resource).toBe(MCP_URL);
    expect(saved.metadata.token_endpoint).toBe(`${AS_URL}/token`); // kept, so refresh needs no discovery
    expect(JSON.stringify(saved)).not.toContain("shh-secret");
    expect(JSON.stringify(saved)).not.toContain(unseal(saved.pending!.verifierEnc));
  });

  it("reuses the stored registration when the authorization server and the callback address are unchanged", async () => {
    addRow({ oauth: blob() });
    const server = serverWithRegistration();
    network.current = server;

    const { authorizeUrl } = await startOAuth(WS, CONNECTION_ID, REDIRECT);

    expect(server.calls.some((c) => c.url === `${AS_URL}/register`)).toBe(false);
    expect(new URL(authorizeUrl).searchParams.get("client_id")).toBe("client-1");
  });

  it("registers again when the callback address changed (another deployment), since the old registration would not accept it", async () => {
    addRow({ oauth: blob({ client: { ...blob().client, redirectUri: "https://old.example.com/api/connections/oauth/callback" } }) });
    const server = serverWithRegistration();
    network.current = server;

    const { authorizeUrl } = await startOAuth(WS, CONNECTION_ID, REDIRECT);

    expect(server.calls.some((c) => c.url === `${AS_URL}/register`)).toBe(true);
    expect(new URL(authorizeUrl).searchParams.get("client_id")).toBe("client-new");
  });

  it("keeps the tokens of an earlier sign-in until the new one completes, so runs keep working meanwhile", async () => {
    const tokens = { accessTokenEnc: "sealed:6174", refreshTokenEnc: null, expiresAt: null };
    addRow({ oauth: blob({ tokens }) });
    network.current = serverWithRegistration();

    await startOAuth(WS, CONNECTION_ID, REDIRECT);

    expect(stored().tokens).toEqual(tokens);
    expect(stored().pending).not.toBeNull();
  });

  it("does not find a connection of another workspace", async () => {
    addRow({ workspaceId: "ws-b" });
    network.current = serverWithRegistration();

    const failed = startOAuth(WS, CONNECTION_ID, REDIRECT);

    await expect(failed).rejects.toBeInstanceOf(SignInError);
    await expect(failed).rejects.toThrow("That connection was not found");
    expect(rows.get(CONNECTION_ID)!.oauth).toBeNull();
  });

  it("says in plain words when the server only accepts apps registered by hand", async () => {
    addRow();
    network.current = fakeFetch({
      ...oauthServerRoutes(),
      [`GET ${AS_URL}/.well-known/oauth-authorization-server`]: () =>
        json({ issuer: AS_URL, authorization_endpoint: `${AS_URL}/authorize`, token_endpoint: `${AS_URL}/token`, response_types_supported: ["code"] }),
    });

    await expect(startOAuth(WS, CONNECTION_ID, REDIRECT)).rejects.toThrow(
      "This server only signs in apps registered by hand, so it cannot be connected this way; add a token instead",
    );
  });

  it("passes on the server's own words when it refuses the registration", async () => {
    addRow();
    network.current = fakeFetch({
      ...oauthServerRoutes(),
      [`POST ${AS_URL}/register`]: () => json({ error: "invalid_redirect_uri", error_description: "Redirect URI must use https" }, 400),
    });

    await expect(startOAuth(WS, CONNECTION_ID, REDIRECT)).rejects.toThrow("The server refused to register this app: Redirect URI must use https");
  });
});

// Discovery: from a connection's URL to the server that signs its users in (MCP authorization spec: a 401's
// WWW-Authenticate names the protected-resource metadata, RFC 9728; that names the authorization server, RFC 8414).
import { describe, expect, it } from "vitest";
import { discoverSignIn } from "./discover";
import { SignInError } from "./errors";
import { AS_METADATA, AS_URL, MCP_URL, PRM, fakeFetch, json, oauthServerRoutes, unauthorized } from "./fake-server";

describe("discoverSignIn", () => {
  it("follows the resource_metadata address a 401's WWW-Authenticate header names, and takes the scope from it", async () => {
    const fetchFn = fakeFetch({
      [`POST ${MCP_URL}`]: () => unauthorized(`Bearer realm="OAuth", resource_metadata="https://mcp.example.com/meta/prm", scope="read write admin"`),
      ["GET https://mcp.example.com/meta/prm"]: () => json(PRM),
      [`GET ${AS_URL}/.well-known/oauth-authorization-server`]: () => json(AS_METADATA),
    });

    const found = await discoverSignIn(MCP_URL, fetchFn);

    expect(found.authorizationServerUrl).toBe(AS_URL);
    expect(found.metadata.token_endpoint).toBe(`${AS_URL}/token`);
    expect(found.resource).toBe(MCP_URL); // RFC 8707: the tokens are asked for this server only
    expect(found.scope).toBe("read write admin"); // the challenge's scope wins over the metadata's list
    expect(fetchFn.calls.map((c) => c.url)).not.toContain("https://mcp.example.com/.well-known/oauth-protected-resource/mcp");
  });

  it("probes the server with an MCP initialize request, as an MCP client would", async () => {
    const fetchFn = fakeFetch(oauthServerRoutes());
    await discoverSignIn(MCP_URL, fetchFn);
    const probe = fetchFn.calls[0];
    expect(probe.method).toBe("POST");
    expect(probe.url).toBe(MCP_URL);
    expect(JSON.parse(probe.body)).toMatchObject({ jsonrpc: "2.0", method: "initialize" });
    expect(probe.headers.get("accept")).toContain("text/event-stream");
  });

  it("falls back to the well-known protected-resource path when the 401 names no metadata, with the scopes it advertises", async () => {
    const fetchFn = fakeFetch({
      [`POST ${MCP_URL}`]: () => unauthorized(`Bearer realm="OAuth"`),
      ["GET https://mcp.example.com/.well-known/oauth-protected-resource/mcp"]: () => json(PRM),
      [`GET ${AS_URL}/.well-known/oauth-authorization-server`]: () => json(AS_METADATA),
    });

    const found = await discoverSignIn(MCP_URL, fetchFn);

    expect(found.authorizationServerUrl).toBe(AS_URL);
    expect(found.resource).toBe(MCP_URL);
    expect(found.scope).toBe("read write");
  });

  it("treats an older server with no protected-resource metadata as its own authorization server, with no resource", async () => {
    const fetchFn = fakeFetch({
      [`POST ${MCP_URL}`]: () => unauthorized(`Bearer realm="OAuth"`),
      ["GET https://mcp.example.com/.well-known/oauth-authorization-server"]: () =>
        json({ ...AS_METADATA, issuer: "https://mcp.example.com", authorization_endpoint: "https://mcp.example.com/authorize" }),
    });

    const found = await discoverSignIn(MCP_URL, fetchFn);

    expect(found.authorizationServerUrl).toBe("https://mcp.example.com/");
    expect(found.resource).toBeNull();
    expect(found.scope).toBeNull();
  });

  it("tells a server without OAuth apart in plain words: add a token instead", async () => {
    const fetchFn = fakeFetch({ [`POST ${MCP_URL}`]: () => unauthorized(`Bearer realm="api"`) });

    const failed = discoverSignIn(MCP_URL, fetchFn);

    await expect(failed).rejects.toBeInstanceOf(SignInError);
    await expect(failed).rejects.toThrow("This server does not offer sign-in; add a token instead");
  });

  it("says a server that answers without any sign-in needs none", async () => {
    const fetchFn = fakeFetch({ [`POST ${MCP_URL}`]: () => json({ jsonrpc: "2.0", id: 1, result: {} }) });

    await expect(discoverSignIn(MCP_URL, fetchFn)).rejects.toThrow("This server works without signing in, so it needs neither a sign-in nor a token");
  });

  it("says so when the server cannot be reached, naming the host", async () => {
    const fetchFn = async () => {
      throw new TypeError("fetch failed");
    };

    const failed = discoverSignIn(MCP_URL, fetchFn);

    await expect(failed).rejects.toBeInstanceOf(SignInError);
    await expect(failed).rejects.toThrow(/could not reach mcp\.example\.com/i);
  });

  it("refuses metadata that claims to protect a different server, so tokens are never asked for another resource", async () => {
    const fetchFn = fakeFetch({
      ...oauthServerRoutes(),
      ["GET https://mcp.example.com/.well-known/oauth-protected-resource/mcp"]: () => json({ ...PRM, resource: "https://other.example.net/mcp" }),
    });

    await expect(discoverSignIn(MCP_URL, fetchFn)).rejects.toThrow(/names a different server/);
  });
});

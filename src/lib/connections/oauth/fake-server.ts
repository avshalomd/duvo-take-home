// Test support only: an MCP server and its authorization server as a fetch function, so the OAuth tests run
// the MCP SDK's real discovery, registration and token code without a network.
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";

export const MCP_URL = "https://mcp.example.com/mcp";
export const AS_URL = "https://auth.example.com";
export const REDIRECT = "http://localhost:3008/api/connections/oauth/callback";

export const AS_METADATA = {
  issuer: AS_URL,
  authorization_endpoint: `${AS_URL}/authorize`,
  token_endpoint: `${AS_URL}/token`,
  registration_endpoint: `${AS_URL}/register`,
  response_types_supported: ["code"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["client_secret_basic", "none"],
  grant_types_supported: ["authorization_code", "refresh_token"],
};

export const PRM = {
  resource: MCP_URL,
  authorization_servers: [AS_URL],
  scopes_supported: ["read", "write"],
};

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

export const unauthorized = (wwwAuthenticate: string) =>
  new Response("unauthorized", { status: 401, headers: { "www-authenticate": wwwAuthenticate } });

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;
export type Call = { method: string; url: string; body: string; headers: Headers };

/** Routes are keyed "METHOD url"; anything else answers 404, as an unknown well-known path would. */
export function fakeFetch(routes: Record<string, Handler>): FetchLike & { calls: Call[] } {
  const calls: Call[] = [];
  const fn = async (url: string | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const href = String(url);
    calls.push({ method, url: href, body: init?.body ? String(init.body) : "", headers: new Headers(init?.headers) });
    const handler = routes[`${method} ${href}`];
    return handler ? handler(init) : new Response("not found", { status: 404 });
  };
  return Object.assign(fn, { calls });
}

/** The network the code under test sees: a test sets `network.current`; ./fetch is mocked with fetchModule. */
export const network: { current: FetchLike } = { current: fakeFetch({}) };
export const fetchModule = { publicFetch: (url: string | URL, init?: RequestInit) => network.current(url, init) };

/** The routes of a well-behaved OAuth MCP server: a 401 naming its metadata, the metadata, and the AS metadata. */
export function oauthServerRoutes(): Record<string, Handler> {
  return {
    [`POST ${MCP_URL}`]: () => unauthorized(`Bearer realm="OAuth", resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"`),
    ["GET https://mcp.example.com/.well-known/oauth-protected-resource/mcp"]: () => json(PRM),
    [`GET ${AS_URL}/.well-known/oauth-authorization-server`]: () => json(AS_METADATA),
  };
}

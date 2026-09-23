import { discoverOAuthServerInfo, extractWWWAuthenticateParams, type OAuthServerInfo } from "@modelcontextprotocol/sdk/client/auth.js";
import type { AuthorizationServerMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { checkResourceAllowed, resourceUrlFromServerUrl } from "@modelcontextprotocol/sdk/shared/auth-utils.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import { SignInError, serverWords } from "./errors";
import { publicFetch } from "./fetch";

export type Discovered = {
  authorizationServerUrl: string;
  metadata: AuthorizationServerMetadata;
  resource: string | null; // RFC 8707 resource indicator; null for an older server that publishes no resource metadata
  scope: string | null;
};

// What an MCP client sends first; a server that needs sign-in answers it with 401 and says where to sign in.
const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "automations-sign-in", version: "1" } },
};

/**
 * Finds how an MCP server wants to be signed in to, per the MCP authorization spec: ask the server (a 401's
 * WWW-Authenticate names its protected-resource metadata, RFC 9728, and the scope), read that metadata or its
 * well-known path, then the authorization server's metadata (RFC 8414). The SDK does the metadata part.
 */
export async function discoverSignIn(serverUrl: string, fetchFn: FetchLike = publicFetch): Promise<Discovered> {
  const probe = await probeServer(serverUrl, fetchFn);

  let info: OAuthServerInfo;
  try {
    info = await discoverOAuthServerInfo(serverUrl, { resourceMetadataUrl: probe.resourceMetadataUrl, fetchFn });
  } catch (e) {
    throw new SignInError("unreadable", `The server's sign-in details could not be read: ${serverWords(e)}`);
  }
  if (!info.authorizationServerMetadata) {
    // No metadata anywhere: a server that answered the probe needs nothing; one that refused wants a token.
    throw probe.status < 400
      ? new SignInError("no_sign_in_needed", "This server works without signing in, so it needs neither a sign-in nor a token")
      : new SignInError("token_only", "This server does not offer sign-in; add a token instead");
  }

  let resource: string | null = null;
  if (info.resourceMetadata) {
    // The tokens are asked for this server only; metadata claiming another resource would get us tokens for it.
    if (!checkResourceAllowed({ requestedResource: resourceUrlFromServerUrl(serverUrl), configuredResource: info.resourceMetadata.resource })) {
      throw new SignInError("other_server", `The server's sign-in metadata names a different server (${info.resourceMetadata.resource}), so it cannot be signed in to safely`);
    }
    resource = info.resourceMetadata.resource;
  }

  // Scope as the SDK chooses it (SEP-835): the 401's scope, else the scopes the resource metadata advertises.
  const scope = probe.scope ?? info.resourceMetadata?.scopes_supported?.join(" ") ?? null;
  return { authorizationServerUrl: info.authorizationServerUrl, metadata: info.authorizationServerMetadata, resource, scope: scope || null };
}

/** One unauthenticated MCP request: its status, and the sign-in hints a 401 carries. */
async function probeServer(serverUrl: string, fetchFn: FetchLike) {
  let res: Response;
  try {
    res = await fetchFn(serverUrl, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, // both, as the streamable HTTP transport requires
      body: JSON.stringify(INITIALIZE),
    });
  } catch (e) {
    throw new SignInError("unreachable", `Could not reach ${new URL(serverUrl).host}: ${serverWords(e)}`);
  }
  const hints = res.status === 401 ? extractWWWAuthenticateParams(res) : {};
  await res.body?.cancel(); // a server that answered may be streaming; we only needed the status and the headers
  return { status: res.status, resourceMetadataUrl: hints.resourceMetadataUrl, scope: hints.scope };
}

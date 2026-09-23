import "server-only";
import { registerClient, startAuthorization } from "@modelcontextprotocol/sdk/client/auth.js";
import type { StartOAuth } from "@/contracts/connection";
import { encryptSecret } from "@/lib/connections/crypto";
import { setConnectionOAuth } from "@/lib/connections/store";
import { discoverSignIn, type Discovered } from "./discover";
import { SignInError, serverWords } from "./errors";
import { publicFetch } from "./fetch";
import { findConnection } from "./rows";
import { clientInformation } from "./sealed";
import { type OAuthBlob, readBlob } from "./shape";
import { newState } from "./state";

/**
 * Starts a sign-in: discover the server's authorization server, register our app there (or reuse the
 * registration), create the PKCE verifier and the state, store them on the connection, and return the URL the
 * browser goes to. The SDK builds the URL: PKCE S256, state, scope and the RFC 8707 resource.
 */
export const startOAuth: StartOAuth = async (workspaceId, connectionId, redirectUri) => {
  const row = await findConnection(workspaceId, connectionId);
  if (!row) throw new SignInError("not_found", "That connection was not found");

  const found = await discoverSignIn(row.url);
  const existing = readBlob(row.oauth);
  const client = canReuse(existing?.client, found.authorizationServerUrl, redirectUri) ? existing!.client : await register(found, redirectUri);

  const state = newState();
  let authorization: Awaited<ReturnType<typeof startAuthorization>>;
  try {
    authorization = await startAuthorization(found.authorizationServerUrl, {
      metadata: found.metadata,
      clientInformation: clientInformation(client),
      redirectUrl: redirectUri,
      scope: found.scope ?? undefined,
      state,
      resource: found.resource ? new URL(found.resource) : undefined,
    });
  } catch (e) {
    throw new SignInError("unsupported", `This server's sign-in is not one this app supports: ${serverWords(e)}`); // e.g. no S256 PKCE
  }

  const blob: OAuthBlob = {
    authorizationServerUrl: found.authorizationServerUrl,
    metadata: found.metadata,
    resource: found.resource,
    scope: found.scope,
    client,
    pending: { state, verifierEnc: encryptSecret(authorization.codeVerifier), createdAt: new Date().toISOString() },
    tokens: existing?.tokens ?? null, // an earlier sign-in keeps working for runs until this one completes
    needsSignIn: existing?.needsSignIn ?? false,
  };
  await setConnectionOAuth(workspaceId, connectionId, blob);
  return { authorizeUrl: authorization.authorizationUrl.href };
};

/** A registration only works with the server it was made at and the callback address it names. */
function canReuse(client: OAuthBlob["client"] | undefined, authorizationServerUrl: string, redirectUri: string): boolean {
  return Boolean(client && client.authorizationServerUrl === authorizationServerUrl && client.redirectUri === redirectUri);
}

/** Dynamic client registration (RFC 7591): the server gives our app a client id for this callback address. */
async function register(found: Discovered, redirectUri: string): Promise<OAuthBlob["client"]> {
  if (!found.metadata.registration_endpoint) {
    throw new SignInError("register_by_hand", "This server only signs in apps registered by hand, so it cannot be connected this way; add a token instead");
  }
  const publicClientAllowed = found.metadata.token_endpoint_auth_methods_supported?.includes("none") ?? false;
  let info: Awaited<ReturnType<typeof registerClient>>;
  try {
    info = await registerClient(found.authorizationServerUrl, {
      metadata: found.metadata,
      clientMetadata: {
        client_name: "Automations",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        // PKCE alone proves who we are where the server allows it; otherwise it issues a secret, stored encrypted.
        ...(publicClientAllowed ? { token_endpoint_auth_method: "none" } : {}),
      },
      scope: found.scope ?? undefined,
      fetchFn: publicFetch,
    });
  } catch (e) {
    throw new SignInError("registration_refused", `The server refused to register this app: ${serverWords(e)}`);
  }
  return {
    clientId: info.client_id,
    clientSecretEnc: info.client_secret ? encryptSecret(info.client_secret) : null,
    authMethod: info.token_endpoint_auth_method ?? null,
    redirectUri,
    authorizationServerUrl: found.authorizationServerUrl,
  };
}

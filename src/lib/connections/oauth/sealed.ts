import "server-only";
import type { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { decryptSecret, encryptSecret } from "@/lib/connections/crypto";
import { expiresAt } from "./expiry";
import type { OAuthBlob } from "./shape";

/** Our stored registration as the SDK's client information, the secret decrypted only for the request. */
export function clientInformation(client: OAuthBlob["client"]): OAuthClientInformationFull {
  return {
    client_id: client.clientId,
    redirect_uris: [client.redirectUri],
    ...(client.clientSecretEnc ? { client_secret: decryptSecret(client.clientSecretEnc) } : {}),
    ...(client.authMethod ? { token_endpoint_auth_method: client.authMethod } : {}), // the SDK authenticates as the registration said
  };
}

/** The tokens a server handed out, encrypted for storage, with the time they stop working. */
export function sealTokens(tokens: OAuthTokens, now: Date): NonNullable<OAuthBlob["tokens"]> {
  return {
    accessTokenEnc: encryptSecret(tokens.access_token),
    refreshTokenEnc: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
    expiresAt: expiresAt(tokens.expires_in, now),
  };
}

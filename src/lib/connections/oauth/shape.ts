import { z } from "zod";
import { OAuthMetadataSchema, OpenIdProviderDiscoveryMetadataSchema } from "@modelcontextprotocol/sdk/shared/auth.js";

/**
 * What one OAuth connection keeps in `connections.oauth` (jsonb). Everything secret is sealed with encryptSecret
 * before it gets here (the *Enc fields); the rest is public data the server published about itself.
 */
export const OAuthBlob = z.object({
  // Where the tokens come from: found by discovery at the last sign-in, kept so a refresh needs no discovery.
  authorizationServerUrl: z.string(),
  metadata: z.union([OAuthMetadataSchema, OpenIdProviderDiscoveryMetadataSchema]), // the server's own endpoints, as published
  resource: z.string().nullable(), // RFC 8707: the MCP server the tokens are for, sent with every authorize, token and refresh request
  scope: z.string().nullable(),
  // Our app's registration at that server (RFC 7591), reused while the server and our callback address stay the same.
  client: z.object({
    clientId: z.string(),
    clientSecretEnc: z.string().nullable(),
    authMethod: z.string().nullable(), // what the registration said, so the token request authenticates the same way
    redirectUri: z.string(),
    authorizationServerUrl: z.string(),
  }),
  // A sign-in in progress: the state the callback must bring back, and the PKCE verifier that proves it is us.
  pending: z.object({ state: z.string(), verifierEnc: z.string(), createdAt: z.string() }).nullable(),
  tokens: z.object({ accessTokenEnc: z.string(), refreshTokenEnc: z.string().nullable(), expiresAt: z.string().nullable() }).nullable(),
  needsSignIn: z.boolean(), // set when a refresh was refused: the person has to sign in again
});
export type OAuthBlob = z.infer<typeof OAuthBlob>;

/** The stored blob, or null when there is none yet or it is not ours (the column is jsonb and could hold anything). */
export function readBlob(oauth: unknown): OAuthBlob | null {
  const parsed = OAuthBlob.safeParse(oauth);
  return parsed.success ? parsed.data : null;
}

/** For the settings page: tokens are stored and a run can use them, now or after a refresh. */
export function isSignedIn(oauth: unknown): boolean {
  const blob = readBlob(oauth);
  return Boolean(blob?.tokens) && !blob?.needsSignIn;
}

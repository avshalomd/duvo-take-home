import "server-only";
import { exchangeAuthorization } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { CompleteOAuth } from "@/contracts/connection";
import { decryptSecret } from "@/lib/connections/crypto";
import { setConnectionOAuth } from "@/lib/connections/store";
import { SignInError, serverWords } from "./errors";
import { publicFetch } from "./fetch";
import { findByPendingState, markOAuth, storeTokensIfUnchanged } from "./rows";
import { clientInformation, sealTokens } from "./sealed";
import { readBlob } from "./shape";
import { checkState } from "./state";

const STATE_GONE = "This sign-in link has expired or was already used; start the sign-in again";

/**
 * The callback's half: find the connection waiting for this state, exchange the code with the stored PKCE
 * verifier, store the tokens encrypted, and say which connection it was.
 */
export const completeOAuth: CompleteOAuth = async ({ code, state, redirectUri }) => {
  const row = await findByPendingState(state);
  const blob = row ? readBlob(row.oauth) : null;
  if (!row || !blob?.pending) throw new SignInError("expired", STATE_GONE);

  const now = new Date();
  // Single use: the pending sign-in is cleared before anything else, so a replayed callback finds nothing, and an
  // expired one is cleared rather than left to be tried again.
  const consumed = { ...blob, pending: null };
  await setConnectionOAuth(row.workspaceId, row.id, consumed);
  if (checkState(blob.pending, state, now) !== "ok") throw new SignInError("expired", STATE_GONE);

  let tokens: OAuthTokens;
  try {
    tokens = await exchangeAuthorization(blob.authorizationServerUrl, {
      metadata: blob.metadata,
      clientInformation: clientInformation(blob.client),
      authorizationCode: code,
      codeVerifier: decryptSecret(blob.pending.verifierEnc),
      redirectUri, // must be the address the authorization request named, or the server refuses the code
      resource: blob.resource ? new URL(blob.resource) : undefined,
      fetchFn: publicFetch,
    });
  } catch (e) {
    throw new SignInError("token_refused", `The server did not accept the sign-in: ${serverWords(e)}`);
  }

  // Conditional (S3): moved to another server or signed in again meanwhile, the tokens are dropped, never sent there.
  const stored = await storeTokensIfUnchanged(row.workspaceId, row.id, row.url, { ...consumed, tokens: sealTokens(tokens, now), needsSignIn: false });
  if (!stored) throw new SignInError("expired", STATE_GONE);
  await markOAuth(row.workspaceId, row.id);
  return { workspaceId: row.workspaceId, connectionId: row.id };
};

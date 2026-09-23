import "server-only";
import { refreshAuthorization } from "@modelcontextprotocol/sdk/client/auth.js";
import { OAuthError, ServerError, TemporarilyUnavailableError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthHeaders } from "@/contracts/connection";
import { decryptSecret } from "@/lib/connections/crypto";
import { setConnectionOAuth } from "@/lib/connections/store";
import { needsRefresh } from "./expiry";
import { publicFetch } from "./fetch";
import { loadOAuth } from "./rows";
import { clientInformation, sealTokens } from "./sealed";
import { type OAuthBlob, readBlob } from "./shape";

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * The headers the agent's MCP client sends to one connection, asked before every run. A bearer connection sends
 * its token. An OAuth connection sends its access token, refreshed first when it expires within a minute; when
 * it has none, the run goes without, the server refuses, and the run reports it as failed (the settings page
 * shows that, and "needs sign-in").
 */
export const authHeaders: AuthHeaders = async (c) => {
  if (c.authType !== "oauth") return c.token ? bearer(c.token) : undefined;

  const blob = readBlob(c.oauth);
  if (!blob?.tokens || blob.needsSignIn) return undefined; // never signed in, or waiting for the person to sign in again
  const now = new Date();
  if (!needsRefresh(blob.tokens.expiresAt, now)) return bearer(decryptSecret(blob.tokens.accessTokenEnc));
  return refreshed(c.id, blob, blob.tokens, now);
};

async function refreshed(id: string, blob: OAuthBlob, tokens: NonNullable<OAuthBlob["tokens"]>, now: Date) {
  if (!tokens.refreshTokenEnc) {
    await save(id, (current) => ({ ...current, tokens: null, needsSignIn: true }));
    return undefined;
  }
  try {
    const fresh = await refreshAuthorization(blob.authorizationServerUrl, {
      metadata: blob.metadata,
      clientInformation: clientInformation(blob.client),
      refreshToken: decryptSecret(tokens.refreshTokenEnc),
      resource: blob.resource ? new URL(blob.resource) : undefined,
      fetchFn: publicFetch,
    });
    await save(id, (current) => ({ ...current, tokens: sealTokens(fresh, now), needsSignIn: false }));
    return bearer(fresh.access_token);
  } catch (e) {
    if (!refused(e)) {
      // The server is down or unreachable: keep the tokens for the next run, and send the old one while it still works.
      return tokens.expiresAt && new Date(tokens.expiresAt) > now ? bearer(decryptSecret(tokens.accessTokenEnc)) : undefined;
    }
    // Servers rotate refresh tokens: a parallel run that refreshed first has made ours stale. Use what it stored.
    const current = readBlob((await loadOAuth(id))?.oauth);
    if (current?.tokens && current.tokens.accessTokenEnc !== tokens.accessTokenEnc && !needsRefresh(current.tokens.expiresAt, now)) {
      return bearer(decryptSecret(current.tokens.accessTokenEnc));
    }
    await save(id, (latest) => ({ ...latest, tokens: null, needsSignIn: true })); // the registration stays, so signing in again is one click
    return undefined;
  }
}

/** The server answered and said no (an OAuth error such as invalid_grant), as opposed to being unavailable. */
function refused(e: unknown): boolean {
  return e instanceof OAuthError && !(e instanceof ServerError) && !(e instanceof TemporarilyUnavailableError);
}

/** Writes a change on top of the row's current OAuth state, not the run's copy, so a sign-in started meanwhile survives. */
async function save(id: string, change: (current: OAuthBlob) => OAuthBlob): Promise<void> {
  const latest = await loadOAuth(id);
  const current = readBlob(latest?.oauth);
  if (!latest || !current) return; // the connection was deleted, or its OAuth state cleared, while the run started
  await setConnectionOAuth(latest.workspaceId, id, change(current));
}

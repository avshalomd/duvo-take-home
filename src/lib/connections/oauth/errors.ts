import { OAuthError, ServerError } from "@modelcontextprotocol/sdk/server/auth/errors.js";

/** Why a sign-in step failed, as a code: the routes put only the code in the address back to the settings page. */
export type SignInCode =
  | "not_found" // the connection is not this workspace's
  | "unreachable" // the server did not answer
  | "unreadable" // its sign-in metadata could not be read
  | "no_sign_in_needed" // it answers without any sign-in
  | "token_only" // it wants a token, and offers no OAuth
  | "other_server" // its metadata claims to protect another server
  | "register_by_hand" // no dynamic client registration
  | "registration_refused"
  | "unsupported" // e.g. no S256 PKCE
  | "expired" // the sign-in link was used or is too old
  | "token_refused"; // the server did not accept the code

/**
 * Every code the OAuth routes send back: a SignInError's, and the routes' own. The settings page has a sentence for
 * each (settings/connections/oauth-error.ts); anything else in the address gets a general one.
 */
export type OAuthErrorCode = SignInCode | "not_allowed" | "cancelled" | "refused" | "incomplete" | "other_browser" | "failed" | "start_failed";

/**
 * A sign-in failure that is expected and explained: the code says which, for the page to word; the message is the
 * full account, the server's own words included, for the server log (security QA: a URL must not carry text the
 * app then shows as its own).
 */
export class SignInError extends Error {
  override name = "SignInError";
  readonly code: SignInCode;
  constructor(code: SignInCode, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * The server's own reason, short enough for one sentence. An OAuth error response carries a description written
 * for people; anything else (an HTML error page, a raw body) is reduced to its HTTP status.
 */
export function serverWords(e: unknown): string {
  if (e instanceof ServerError) {
    const status = /^HTTP (\d{3})/.exec(e.message)?.[1]; // the SDK prefixes an unreadable error body with its status
    if (status) return `it answered with an error (HTTP ${status})`;
  }
  const text = e instanceof OAuthError ? e.message || e.errorCode : e instanceof Error ? e.message : String(e);
  const line = text.split("\n")[0].trim();
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}

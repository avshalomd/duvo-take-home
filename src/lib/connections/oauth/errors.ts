import { OAuthError, ServerError } from "@modelcontextprotocol/sdk/server/auth/errors.js";

/** A sign-in failure whose message is written for the person: the callback puts it on the settings page as is. */
export class SignInError extends Error {
  override name = "SignInError";
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

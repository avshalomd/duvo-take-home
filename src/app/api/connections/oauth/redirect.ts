import { NextResponse } from "next/server";
import type { OAuthErrorCode } from "@/lib/connections/oauth/errors";

/**
 * The cookie that ties a sign-in to the browser that started it. Without it, someone could start a sign-in for
 * their own connection and send the authorization link to a victim, whose account would land on their connection.
 */
export const STATE_COOKIE = "oauth_state";
export const COOKIE_PATH = "/api/connections/oauth"; // sent to the start and the callback, nowhere else

/** Where the server sends the browser back. Start and callback compute it the same way, as the token request requires. */
export function callbackUri(req: Request): string {
  const base = process.env.BETTER_AUTH_URL || new URL(req.url).origin; // the public address when set; the request's origin in development
  return `${base.replace(/\/+$/, "")}/api/connections/oauth/callback`;
}

/** Back to the connections page with one outcome for the person (?signed_in=<name> or ?oauth_error=<code>). */
export function backToSettings(req: Request, params: Record<string, string>): NextResponse {
  const to = new URL("/settings/connections", req.url);
  for (const [key, value] of Object.entries(params)) to.searchParams.set(key, value);
  return NextResponse.redirect(to, 302);
}

/** A failed sign-in: only its code travels, and the page words it (settings/connections/oauth-error.ts). */
export function failedBack(req: Request, code: OAuthErrorCode): NextResponse {
  return backToSettings(req, { oauth_error: code });
}

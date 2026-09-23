import type { OAuthErrorCode } from "@/lib/connections/oauth/errors";

// The sentence the connections page says for each code the OAuth routes send back (?oauth_error=<code>). The address
// carries a code only: anyone can write a link, and text from it shown in the app's own toast would be the app
// saying whatever the link's author wanted (security QA). A Record, so a code added later without a sentence is a
// type error rather than a silent fallback.
const SENTENCES: Record<OAuthErrorCode, string> = {
  not_allowed: "Only an owner or an admin can sign a connection in",
  not_found: "That connection was not found",
  cancelled: "The sign-in was cancelled",
  refused: "The service refused the sign-in; try again, or ask whoever runs it",
  incomplete: "The sign-in came back incomplete; start it again",
  other_browser: "This sign-in was not started in this browser, or it took too long; start it again",
  expired: "This sign-in link has expired or was already used; start the sign-in again",
  unreachable: "The server could not be reached; check its address and try again",
  unreadable: "The server's sign-in details could not be read; try again later",
  no_sign_in_needed: "This server works without signing in, so it needs neither a sign-in nor a token",
  token_only: "This server does not offer sign-in; add a token instead",
  other_server: "The server's sign-in details name a different server, so it cannot be signed in to safely",
  register_by_hand: "This server only signs in apps registered by hand, so it cannot be connected this way; add a token instead",
  registration_refused: "The server refused to register this app; try again later, or add a token instead",
  unsupported: "This server's sign-in is not one this app supports; add a token instead",
  token_refused: "The server did not accept the sign-in; start it again",
  failed: "The sign-in failed; start it again",
  start_failed: "The sign-in could not start; try again",
};

export const OAUTH_ERROR_FALLBACK = "The sign-in did not work; start it again";

/** The page's own sentence for a code; one general sentence for anything it does not know; nothing for no code. */
export function oauthErrorSentence(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return Object.hasOwn(SENTENCES, code) ? SENTENCES[code as OAuthErrorCode] : OAUTH_ERROR_FALLBACK; // hasOwn: "constructor" is not a code
}

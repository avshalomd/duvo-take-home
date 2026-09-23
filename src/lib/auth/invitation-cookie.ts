// Pure: no Next or Better Auth imports, so the proxy and the sign-up hook share it and it is tested as plain functions.

/**
 * In invite-only mode an account needs proof that the person opened the invitation's link, not just its email
 * address (anyone may know that). The invitation page's visit leaves the id in this cookie, and the sign-up reads it
 * back. A cookie rather than a form field because a Google sign-up arrives at Better Auth's callback with no form of
 * ours in between; the cookie reaches both the email form's request and that callback.
 */
export const INVITATION_COOKIE = "handover_invitation";
export const INVITATION_COOKIE_PATH = "/api/auth"; // the sign-up and Google's callback live here; no page sees it
const MAX_AGE_S = 48 * 60 * 60; // as long as an invitation stays open (Better Auth's default expiry)
const ID = /^[A-Za-z0-9_-]{1,100}$/; // Better Auth's ids, and the e2e suite's "e2e-invite-..." ones

/** The cookie the proxy sets on a visit to /invite/<id>. httpOnly: no script needs it. Lax: Google's redirect back is a top-level GET, which still carries it. */
export function invitationCookie(invitationId: string, secure: boolean) {
  return {
    name: INVITATION_COOKIE,
    value: invitationId,
    httpOnly: true,
    secure, // false only on a plain-http development server, where a Secure cookie would be dropped
    sameSite: "lax" as const,
    path: INVITATION_COOKIE_PATH,
    maxAge: MAX_AGE_S,
  };
}

/** The invitation id a request carries, or null. Anything not shaped like an id is ignored rather than looked up. */
export function invitationIdFromCookies(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(";")) {
    const at = pair.indexOf("=");
    if (at < 0 || pair.slice(0, at).trim() !== INVITATION_COOKIE) continue;
    const value = pair.slice(at + 1).trim();
    return ID.test(value) ? value : null;
  }
  return null;
}

/** Whether a path segment could be an invitation id, so the proxy never writes junk into the cookie. */
export const looksLikeInvitationId = (value: string) => ID.test(value);

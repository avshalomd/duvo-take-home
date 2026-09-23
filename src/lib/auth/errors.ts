// Better Auth answers with codes ("INVALID_EMAIL_OR_PASSWORD"); the forms show a sentence a person can act on.
const TAKEN = ["USER_ALREADY_EXISTS", "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"];

const MESSAGES: Record<string, string> = {
  // one sentence for both, so the form never tells a stranger which emails have an account
  INVALID_EMAIL_OR_PASSWORD: "That email and password do not match.",
  // the sign-up form adds "Sign in instead" as a link with the email filled in (Q110)
  USER_ALREADY_EXISTS: "There is already an account with that email.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "There is already an account with that email.",
  PASSWORD_TOO_SHORT: "Use at least 8 characters for the password.",
  PASSWORD_TOO_LONG: "That password is too long. Use at most 128 characters.",
  INVALID_EMAIL: "That does not look like an email address.",
  // the sign-up form is only shown with an invitation, so a refusal there means another email was typed, or the link
  // was opened in another browser (the sign-up needs the id it left in a cookie, Q167); one line for both, so the form
  // never tells a stranger which emails hold an invitation
  SIGNUP_INVITE_ONLY: "This does not match an invitation. Use the address your invitation was sent to, and open its link in this browser.",
};

const FALLBACK = "Something went wrong. Try again in a moment.";

/** The code the server refuses an uninvited sign-up with (lib/auth/signup.ts), and what a person reads for it. */
export const INVITE_ONLY_CODE = "SIGNUP_INVITE_ONLY";
export const INVITE_ONLY = "Handover is invite-only. Open your invitation link, or ask someone in a workspace to invite you.";

/**
 * Google sends a failed sign-in back to the sign-in page as ?error=<code>. The one a person can act on is the
 * invite-only refusal; anything else gets a calm general line (the code itself is in the server log).
 */
export function oauthErrorMessage(error: string | undefined): string | null {
  if (!error) return null;
  if (error === INVITE_ONLY_CODE) return INVITE_ONLY;
  return "Signing in with Google did not work. Try again, or use your email.";
}

/** The sign-up failed because the email already has an account: the form then offers to sign in instead. */
export function accountExists(error: { code?: string } | null): boolean {
  return Boolean(error?.code && TAKEN.includes(error.code));
}

export function friendlyAuthError(error: { code?: string; status?: number } | null): string {
  if (!error) return FALLBACK;
  if (error.status === 429) return "Too many tries. Wait a minute, then try again.";
  return (error.code && MESSAGES[error.code]) || FALLBACK;
}

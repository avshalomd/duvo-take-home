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
};

const FALLBACK = "Something went wrong. Try again in a moment.";

/** The sign-up failed because the email already has an account: the form then offers to sign in instead. */
export function accountExists(error: { code?: string } | null): boolean {
  return Boolean(error?.code && TAKEN.includes(error.code));
}

export function friendlyAuthError(error: { code?: string; status?: number } | null): string {
  if (!error) return FALLBACK;
  if (error.status === 429) return "Too many tries. Wait a minute, then try again.";
  return (error.code && MESSAGES[error.code]) || FALLBACK;
}

// Better Auth answers with codes ("INVALID_EMAIL_OR_PASSWORD"); the forms show a sentence a person can act on.
const MESSAGES: Record<string, string> = {
  // one sentence for both, so the form never tells a stranger which emails have an account
  INVALID_EMAIL_OR_PASSWORD: "That email and password do not match.",
  USER_ALREADY_EXISTS: "There is already an account with that email. Sign in instead.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "There is already an account with that email. Sign in instead.",
  PASSWORD_TOO_SHORT: "Use at least 8 characters for the password.",
  PASSWORD_TOO_LONG: "That password is too long. Use at most 128 characters.",
  INVALID_EMAIL: "That does not look like an email address.",
};

const FALLBACK = "Something went wrong. Try again in a moment.";

export function accountExists(_error: { code?: string } | null): boolean {
  return false; // STUB
}

export function friendlyAuthError(error: { code?: string; status?: number } | null): string {
  if (!error) return FALLBACK;
  if (error.status === 429) return "Too many tries. Wait a minute, then try again.";
  return (error.code && MESSAGES[error.code]) || FALLBACK;
}

// The password rule, said once. Better Auth holds it on the server (auth.ts); the sign-up form asks it before sending,
// so a short password gets the app's own words under the field rather than the browser's bubble (UX QA U27).
// Pure: the client form and the server config both import it.

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128; // Better Auth's default maximum, said here so the form refuses the same

export const PASSWORD_TOO_SHORT = `Use at least ${MIN_PASSWORD_LENGTH} characters for the password.`;
export const PASSWORD_TOO_LONG = `That password is too long. Use at most ${MAX_PASSWORD_LENGTH} characters.`;

/** Why this password would be refused, in a sentence, or null when it passes. */
export function passwordRefusal(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return PASSWORD_TOO_SHORT;
  if (password.length > MAX_PASSWORD_LENGTH) return PASSWORD_TOO_LONG;
  return null;
}

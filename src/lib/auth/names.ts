import { NUL_REFUSED, hasNoNul } from "@/contracts/text";

// A person's and a workspace's name as Better Auth stores them (QA F1, F21). Its own endpoints take any length and any
// character, so the rules sit in its hooks (auth.ts), which every door goes through: the form, the API, Google.
export const MAX_USER_NAME = 80; // the sign-up form's maxLength
export const MAX_WORKSPACE_NAME = 60; // the new-workspace form's limit (lib/auth/actions.ts)

type Refusal = { code: "NAME_TOO_LONG" | "NAME_HIDDEN_CHARACTER"; message: string };

export const NAME_TOO_LONG = `Keep your name under ${MAX_USER_NAME} characters.`;

/** Why this person's name cannot be stored, or null when it can. The code is what the sign-up form shows words for. */
export function userNameRefusal(name: string): Refusal | null {
  if (!hasNoNul(name)) return { code: "NAME_HIDDEN_CHARACTER", message: NUL_REFUSED };
  if (name.length > MAX_USER_NAME) return { code: "NAME_TOO_LONG", message: NAME_TOO_LONG };
  return null;
}

/** Why this workspace's name cannot be stored, or null when it can. */
export function workspaceNameRefusal(name: string): Refusal | null {
  if (!hasNoNul(name)) return { code: "NAME_HIDDEN_CHARACTER", message: NUL_REFUSED };
  if (name.length > MAX_WORKSPACE_NAME) return { code: "NAME_TOO_LONG", message: `Keep the workspace's name under ${MAX_WORKSPACE_NAME} characters.` };
  return null;
}

import { isAPIError } from "better-auth/api";
import { MemberChangeError } from "@/lib/auth/member-rules";
import { SecretError } from "@/lib/connections/crypto";
import { ConnectionNotFoundError } from "@/lib/connections/store";
import { readable } from "../readable";

// What a failed Settings action may say to the browser. The errors written for a person are forwarded; anything
// else goes through readable(), which logs it and answers one safe sentence (a database error names the host).

export function settingsError(e: unknown): string {
  if (e instanceof ConnectionNotFoundError) return e.message;
  if (e instanceof SecretError)
    return e.problem === "key"
      ? "Tokens cannot be saved right now: this app has no encryption key set up (CONNECTION_KEY). Ask whoever runs it."
      : e.message;
  return readable(e);
}

export function memberError(e: unknown): string {
  if (e instanceof MemberChangeError) return e.message; // the app's own refusals (lib/auth/member-rules.ts)
  if (isAPIError(e)) return e.message; // Better Auth still saying no after ours said yes: someone changed it meanwhile
  return readable(e);
}

export function inviteError(e: unknown): string {
  if (isAPIError(e)) return e.message; // Better Auth's own refusals are written for users ("You are not allowed to invite ...")
  return readable(e);
}

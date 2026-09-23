import { isAPIError } from "better-auth/api";
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

export function inviteError(e: unknown): string {
  // until the auth package lands, inviteMember is a stub: say so plainly instead of "something went wrong"
  if (e instanceof Error && e.message.startsWith("not implemented")) return "Invitations are not switched on yet. Try again later.";
  if (isAPIError(e)) return e.message; // Better Auth's messages are written for users ("already a member", ...)
  return readable(e);
}

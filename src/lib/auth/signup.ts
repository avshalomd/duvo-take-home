import "server-only";
import { APIError } from "better-auth/api";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { invitation } from "@/db/schema";
import { INVITE_ONLY, INVITE_ONLY_CODE } from "./errors";
import { signupMode } from "./signup-mode";

/** True when the email holds an invitation nobody has used, revoked or let expire. */
export async function hasPendingInvitation(email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: invitation.id })
    .from(invitation)
    // lower() on both sides: Better Auth stores emails in lower case, a hand-made row might not
    .where(and(eq(sql`lower(${invitation.email})`, email.toLowerCase()), eq(invitation.status, "pending"), gt(invitation.expiresAt, new Date())))
    .limit(1);
  return Boolean(row);
}

/**
 * Runs before Better Auth writes any new user, from the email form, the API or Google alike, so there is one rule
 * for every way an account can be made. In invite mode, an email without a pending invitation is refused; the
 * code reaches the form as the error's code, and Google's callback as ?error=SIGNUP_INVITE_ONLY.
 */
export async function assertMayCreateAccount(email: string): Promise<void> {
  if (signupMode() === "open") return;
  if (await hasPendingInvitation(email)) return;
  throw new APIError("FORBIDDEN", { code: INVITE_ONLY_CODE, message: INVITE_ONLY });
}

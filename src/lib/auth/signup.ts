import "server-only";
import { APIError } from "better-auth/api";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { invitation, organization } from "@/db/schema";
import { INVITE_ONLY, INVITE_ONLY_CODE } from "./errors";
import { signupMode } from "./signup-mode";
import { isPersonalWorkspace } from "./workspace-name";

/**
 * True when this invitation is for this email, nobody has used, revoked or let it expire, and it is to a shared
 * workspace. An invitation to a personal one does not open sign-up (security review S11, his call): every account owns
 * one, so it let any account mint new ones, or take an address before its real invitation came.
 */
export async function invitationOpensSignUp(invitationId: string, email: string): Promise<boolean> {
  const [row] = await db
    .select({ workspaceId: organization.id, slug: organization.slug })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .where(
      and(
        eq(invitation.id, invitationId),
        // lower() on both sides: Better Auth stores emails in lower case, a hand-made row might not
        eq(sql`lower(${invitation.email})`, email.toLowerCase()),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return Boolean(row) && !isPersonalWorkspace({ id: row.workspaceId, slug: row.slug });
}

/**
 * Runs before Better Auth writes any new user, from the email form, the API or Google alike, so there is one rule
 * for every way an account can be made. In invite mode the request must carry the invitation from its link (the
 * cookie the invitation page leaves, lib/auth/invitation-cookie.ts), and that invitation must be this email's: an
 * email address alone is something anyone can know, and whoever makes its account first could take the invitation.
 * The refusal's code reaches the form as the error's code, and Google's callback as ?error=SIGNUP_INVITE_ONLY.
 */
export async function assertMayCreateAccount(email: string, invitationId: string | null): Promise<void> {
  if (signupMode() === "open") return;
  if (invitationId && (await invitationOpensSignUp(invitationId, email))) return;
  throw new APIError("FORBIDDEN", { code: INVITE_ONLY_CODE, message: INVITE_ONLY });
}

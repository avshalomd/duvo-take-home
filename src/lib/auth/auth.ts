import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { APIError } from "better-auth/api";
import { invitationIdFromCookies } from "./invitation-cookie";
import { userNameRefusal, workspaceNameRefusal } from "./names";
import { refuseInvitationLists, stripInvitationsForMembers } from "./invitation-privacy";
import { organizationWritesGuard } from "./organization-writes";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./password";
import { trustedOrigins } from "./origins";
import { MAX_OWNED_WORKSPACES, ownedWorkspaceCount } from "./workspace-limit";
import { googleConfigured } from "./providers";
import { assertMayCreateAccount } from "./signup";
import { createPersonalWorkspace, firstWorkspaceId } from "./workspaces";

/** A name rule's refusal as Better Auth's 400, whose code the forms turn into a sentence (errors.ts). */
function refuseName(refusal: ReturnType<typeof userNameRefusal>): void {
  if (refusal) throw new APIError("BAD_REQUEST", { code: refusal.code, message: refusal.message });
}

/**
 * Sign-in and workspaces. Better Auth keeps users, sessions and accounts in our Postgres through Drizzle; its
 * organization plugin is the workspace model (members, roles, invitations, the active workspace on the session),
 * so tenancy is one column, `workspace_id`, on our own tables.
 */
export const auth = betterAuth({
  // transaction: false (the default, said out loud): `db` is the Neon HTTP driver, which cannot hold an
  // interactive transaction open, so Better Auth runs a multi-step write (sign-up: user, account, session) step by step.
  database: drizzleAdapter(db, { provider: "pg", schema, transaction: false }),
  // Every page reads the session first: with joins it is one query (the session with its user, through the relations
  // in db/auth-schema.ts) instead of two one after the other. Without them Better Auth reads the user separately.
  advanced: { database: { joins: true } },
  // the same numbers the sign-up form asks before sending (password.ts, UX QA U27)
  emailAndPassword: { enabled: true, minPasswordLength: MIN_PASSWORD_LENGTH, maxPasswordLength: MAX_PASSWORD_LENGTH },
  socialProviders: googleConfigured()
    ? { google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! } }
    : {},
  trustedOrigins: trustedOrigins(), // the local dev servers, outside production only (origins.ts)
  // Tries per client address and path (Q176). Better Auth turns this on only when NODE_ENV is production and counts in
  // each server's memory, so on Vercel every function instance kept a count of its own. On everywhere (development and
  // the tests meet what production does), counted in the rate_limit table (db/schema.ts) that every instance shares.
  rateLimit: {
    enabled: true,
    storage: "database",
    // Better Auth's own rule for these two, said out loud so an upgrade cannot loosen it: 3 tries per 10 seconds.
    // Other paths keep its defaults (100 per 10 s; password resets 3 per minute).
    customRules: {
      "/sign-in/email": { window: 10, max: 3 },
      "/sign-up/email": { window: 10, max: 3 },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // SIGNUP_MODE=invite: no account without the invitation's link, however it is asked for (form, API, Google).
        // The form's request and Google's callback both carry the cookie the invitation page left.
        before: async (user, ctx) => {
          refuseName(userNameRefusal(user.name)); // capped, and no NUL character, however the name arrives (F1, F21)
          const cookies = (ctx?.headers ?? ctx?.request?.headers)?.get("cookie");
          await assertMayCreateAccount(user.email, invitationIdFromCookies(cookies));
        },
        // Every new account, by password or by Google, gets its own workspace with the user as owner.
        after: async (user) => {
          await createPersonalWorkspace(user);
        },
      },
      update: {
        before: async (data) => {
          if (typeof data.name === "string") refuseName(userNameRefusal(data.name));
        },
      },
    },
    session: {
      create: {
        // A new session opens in the user's first workspace. On sign-up the workspace does not exist yet at this
        // point (the user hook runs after), and createPersonalWorkspace points the session at it instead.
        before: async (session) => {
          const activeOrganizationId = await firstWorkspaceId(session.userId);
          return { data: { ...session, activeOrganizationId } };
        },
      },
    },
  },
  // Invitation ids go to owners and admins only (lib/auth/invitation-privacy.ts): the plugin would give them to any member.
  hooks: { before: refuseInvitationLists, after: stripInvitationsForMembers },
  plugins: [
    // No screen deletes a workspace: its runs, connections and schedules have no foreign key to it and would outlive it (S4)
    organization({
      disableOrganizationDeletion: true,
      // at most five owned, the personal one included (S1): true refuses the new one (workspace-limit.ts)
      organizationLimit: async (user) => (await ownedWorkspaceCount(user.id)) >= MAX_OWNED_WORKSPACES,
      organizationHooks: {
        // the new-workspace form's limit, held for every caller of Better Auth (F21); no NUL character (F1)
        beforeCreateOrganization: async ({ organization: o }) => refuseName(workspaceNameRefusal(o.name ?? "")),
        beforeUpdateOrganization: async ({ organization: o }) => {
          if (typeof o.name === "string") refuseName(workspaceNameRefusal(o.name));
        },
      },
    }),
    organizationWritesGuard(), // the org writes only through our actions, never over HTTP (organization-writes.ts)
    nextCookies(), // last: it sets cookies from Server Actions
  ],
});

export type Auth = typeof auth;

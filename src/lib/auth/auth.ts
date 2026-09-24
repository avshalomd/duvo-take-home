import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { invitationIdFromCookies } from "./invitation-cookie";
import { refuseInvitationLists, stripInvitationsForMembers } from "./invitation-privacy";
import { organizationWritesGuard } from "./organization-writes";
import { trustedOrigins } from "./origins";
import { googleConfigured } from "./providers";
import { assertMayCreateAccount } from "./signup";
import { createPersonalWorkspace, firstWorkspaceId } from "./workspaces";

/**
 * Sign-in and workspaces. Better Auth keeps users, sessions and accounts in our Postgres through Drizzle; its
 * organization plugin is the workspace model (members, roles, invitations, the active workspace on the session),
 * so tenancy is one column, `workspace_id`, on our own tables.
 */
export const auth = betterAuth({
  // transaction: false (the default, said out loud): `db` is the Neon HTTP driver, which cannot hold an
  // interactive transaction open, so Better Auth runs a multi-step write (sign-up: user, account, session) step by step.
  database: drizzleAdapter(db, { provider: "pg", schema, transaction: false }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
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
          const cookies = (ctx?.headers ?? ctx?.request?.headers)?.get("cookie");
          await assertMayCreateAccount(user.email, invitationIdFromCookies(cookies));
        },
        // Every new account, by password or by Google, gets its own workspace with the user as owner.
        after: async (user) => {
          await createPersonalWorkspace(user);
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
    organization({ disableOrganizationDeletion: true }),
    organizationWritesGuard(), // the org writes only through our actions, never over HTTP (organization-writes.ts)
    nextCookies(), // last: it sets cookies from Server Actions
  ],
});

export type Auth = typeof auth;

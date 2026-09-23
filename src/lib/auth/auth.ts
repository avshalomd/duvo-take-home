import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { googleConfigured } from "./providers";
import { createPersonalWorkspace, firstWorkspaceId } from "./workspaces";

// Local dev servers: main on 3000, each worktree on 3001+. Better Auth refuses a sign-in whose Origin it does not
// trust, and BETTER_AUTH_URL names only one of them.
const LOCAL_ORIGINS = Array.from({ length: 11 }, (_, i) => `http://localhost:${3000 + i}`);

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
  trustedOrigins: LOCAL_ORIGINS,
  databaseHooks: {
    user: {
      create: {
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
  plugins: [organization(), nextCookies()], // nextCookies last: it sets cookies from Server Actions
});

export type Auth = typeof auth;

import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";

/**
 * Sign-in and workspaces. Better Auth keeps users, sessions and accounts in our Postgres through Drizzle; its
 * organization plugin is the workspace model (members, roles, invitations, the active workspace on the session),
 * so tenancy is one column, `workspace_id`, on our own tables.
 * WP0 lays the minimal config the schema is generated from; the auth package adds the personal workspace on
 * sign-up, Google when configured, and the invitation link.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  plugins: [organization(), nextCookies()], // nextCookies last: it sets cookies from Server Actions
});

export type Auth = typeof auth;

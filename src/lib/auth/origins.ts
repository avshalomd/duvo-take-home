// Local dev servers: main on 3000, each worktree on 3001+. Better Auth refuses a sign-in whose Origin it does not
// trust, and BETTER_AUTH_URL names only one of them.
const LOCAL_ORIGINS = Array.from({ length: 11 }, (_, i) => `http://localhost:${3000 + i}`);

/**
 * The origins Better Auth trusts beside BETTER_AUTH_URL, for its origin check and its redirect targets. Production
 * trusts none (security review S6): a page on a user's own dev server must not pass for the app. A production build
 * run locally (`next start`) still trusts its BETTER_AUTH_URL, which is how the other origins are reached.
 */
export function trustedOrigins(nodeEnv: string | undefined = process.env.NODE_ENV): string[] {
  return nodeEnv === "production" ? [] : LOCAL_ORIGINS;
}

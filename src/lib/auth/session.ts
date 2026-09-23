import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { RequireSession, SessionCtx, SessionFromHeaders } from "@/contracts/auth";
import { auth } from "./auth";
import { pickMembership, toSessionCtx } from "./session-ctx";
import { createPersonalWorkspace, membershipsOf, setActiveWorkspace } from "./workspaces";

// The seeded demo workspace and user: every row from before v2 is backfilled into this workspace.
export const DEMO_WORKSPACE_ID = "demo-workspace";
export const DEMO_USER_ID = "demo-user";

/**
 * Who is asking and in which workspace, read from the session cookie. Better Auth checks the cookie against the
 * session table; the workspace is the session's active one, or the user's first when that is unset or no longer
 * theirs (then written back, so the next request agrees).
 */
async function resolve(requestHeaders: Headers): Promise<SessionCtx | null> {
  const found = await auth.api.getSession({ headers: requestHeaders });
  if (!found) return null;

  let memberships = await membershipsOf(found.user.id);
  if (memberships.length === 0) {
    // Only reachable if the sign-up hook failed or the workspace was deleted: give the user a place to work.
    await createPersonalWorkspace(found.user);
    memberships = await membershipsOf(found.user.id);
  }
  const active = found.session.activeOrganizationId ?? null;
  const chosen = pickMembership(memberships, active);
  if (!chosen) return null;
  if (chosen.workspaceId !== active) await setActiveWorkspace(found.session.id, chosen.workspaceId);
  return toSessionCtx(found.user, chosen);
}

/**
 * Server Components and Server Actions: the session, or a redirect to /sign-in. cache() makes the layout and the
 * page share one lookup per request instead of reading the session table twice.
 */
export const requireSession: RequireSession = cache(async () => {
  const ctx = await resolve(await headers());
  if (!ctx) redirect("/sign-in");
  return ctx;
});

/** Route handlers: the session, or null so the route answers 401 instead of redirecting a fetch. */
export const sessionFromHeaders: SessionFromHeaders = (requestHeaders) => resolve(requestHeaders);

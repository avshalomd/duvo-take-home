import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { RequireSession, SessionCtx, SessionFromHeaders } from "@/contracts/auth";
import { auth } from "./auth";
import { requestedPath, signInPath } from "./paths";
import { pickMembership, toSessionCtx } from "./session-ctx";
import { createPersonalWorkspace, membershipsOf, setActiveWorkspace } from "./workspaces";

// The seeded demo workspace and user: every row from before v2 is backfilled into this workspace.
export const DEMO_WORKSPACE_ID = "demo-workspace";
export const DEMO_USER_ID = "demo-user";

/** `left`: the session still named a workspace the user is no longer in (removed while a tab showed it). */
type Resolved = { ctx: SessionCtx; left: boolean };

/**
 * Who is asking and in which workspace, read from the session cookie. Better Auth checks the cookie against the
 * session table; the workspace is the session's active one, or the user's first when that is unset or no longer
 * theirs. A page load writes that fallback back, so the next request agrees. A Server Action does not (review R2): the
 * tab that sent it still shows the workspace they left, so its next write must be refused as this one is.
 */
async function resolve(requestHeaders: Headers): Promise<Resolved | null> {
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
  const fellBack = chosen.workspaceId !== active;
  // Next marks every Server Action request with this header; a page render or a route handler has none
  if (fellBack && !requestHeaders.has("next-action")) await setActiveWorkspace(found.session.id, chosen.workspaceId);
  return { ctx: toSessionCtx(found.user, chosen), left: fellBack && active !== null };
}

/** One lookup per request: cache() lets the layout, the page and an action's checks share it. */
const resolveRequest = cache(async () => resolve(await headers()));

/** Server Components and Server Actions: the session, or a redirect to /sign-in. */
export const requireSession: RequireSession = async () => {
  const found = await resolveRequest();
  // The page that was asked for comes along as ?next= (the proxy recorded it), so signing in returns there (Q130).
  if (!found) redirect(signInPath(requestedPath(await headers())));
  return found.ctx;
};

export const WORKSPACE_LEFT = "You are no longer in that workspace. Reload the page.";

/**
 * For a Server Action that writes without naming a record - a run from the Home box, an invitation, a connection, the
 * limits (review R2). When the tab still shows a workspace its user has left, requireSession falls back to their own,
 * and such a write would land there unseen; this is the sentence to refuse it with, or null when it may go ahead. An
 * action that names a record needs no such check: the fallback workspace answers "not found".
 */
export async function leftWorkspaceRefusal(): Promise<string | null> {
  return (await resolveRequest())?.left ? WORKSPACE_LEFT : null;
}

/** Route handlers: the session, or null so the route answers 401 instead of redirecting a fetch. */
export const sessionFromHeaders: SessionFromHeaders = async (requestHeaders) => (await resolve(requestHeaders))?.ctx ?? null;

/**
 * The lookup with its headers passed in, with `left`: for a route handler that writes without naming a record
 * (POST /api/runs, F15), and for the integration test.
 */
export const resolveSession = resolve;

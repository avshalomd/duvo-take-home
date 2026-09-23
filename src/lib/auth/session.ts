import "server-only";
import type { RequireSession, SessionFromHeaders, SessionCtx } from "@/contracts/auth";

// The seeded demo workspace and user: every row from before v2 is backfilled into this workspace.
export const DEMO_WORKSPACE_ID = "demo-workspace";
export const DEMO_USER_ID = "demo-user";
const DEMO: SessionCtx = {
  userId: DEMO_USER_ID,
  userName: "Demo",
  email: "demo@example.com",
  workspaceId: DEMO_WORKSPACE_ID,
  workspaceName: "Demo workspace",
  role: "owner",
};

/** The session, or a redirect to /sign-in. */
export const requireSession: RequireSession = async () => DEMO; // STUB: the auth package reads the Better Auth session

/** For route handlers: the session, or null (the route answers 401). */
export const sessionFromHeaders: SessionFromHeaders = async () => DEMO; // STUB

import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

/**
 * Better Auth's organization plugin answers every one of its writes over HTTP, but the app makes these writes only
 * through its own actions (lib/auth/actions.ts, lib/auth/members.ts), with auth.api and the app's rules around them:
 * the member-change lock (no workspace ends with no owner, F2), the name limits (F3), one pending invitation per
 * address (Q170, F5), and no deleting a workspace that owns runs, connections and schedules (S4, F4). Over HTTP each
 * of them skipped those rules, so there they are refused. The app's own client calls none of them: it signs in and
 * up (lib/auth/client.ts); switching workspaces, accepting and declining an invitation stay open.
 */
const WRITES = new Set([
  "/organization/create",
  "/organization/update",
  "/organization/delete",
  "/organization/invite-member",
  "/organization/cancel-invitation",
  "/organization/update-member-role",
  "/organization/remove-member",
  "/organization/leave", // the app has no leave: two owners leaving at once could leave the workspace with none
]);

export const ORGANIZATION_WRITES_REFUSED = "Workspaces and their members are changed from Handover's own pages: Settings and the workspace menu.";

/** The refusal for this path, or null to let it through. `overHttp`: the call came as a request, not through auth.api. */
export function organizationWriteRefusal(path: string, overHttp: boolean): string | null {
  return overHttp && WRITES.has(path) ? ORGANIZATION_WRITES_REFUSED : null;
}

/**
 * The rule as a Better Auth plugin: its before-hook runs on every call, and only a call that came as a request carries
 * `ctx.request` (auth.api calls from our actions pass headers alone), which is how "over HTTP" is told apart.
 */
export const organizationWritesGuard = () =>
  ({
    id: "handover-organization-writes",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path?.startsWith("/organization/") ?? false,
          handler: createAuthMiddleware(async (ctx) => {
            const refusal = organizationWriteRefusal(ctx.path, Boolean(ctx.request));
            if (refusal) throw new APIError("FORBIDDEN", { message: refusal });
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;

import type { SessionCtx } from "@/contracts/auth";

/**
 * Owners and admins change a workspace's settings (connections, limits, invitations); members see them. The pages
 * use it to show a read-only view, and every action checks it again, because anyone can post to an action. An
 * allowlist, so a role added later starts read-only.
 */
export function canChangeSettings(role: SessionCtx["role"]): boolean {
  return role === "owner" || role === "admin";
}

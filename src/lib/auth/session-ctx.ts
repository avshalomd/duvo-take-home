import type { SessionCtx } from "@/contracts/auth";

// Pure: from Better Auth's rows to the SessionCtx every server read takes its workspace from. No database here,
// so the rules (which workspace, which role) are tested without one.

/** One row of "the user is a member of this workspace", joined with the workspace's name. */
export type Membership = { workspaceId: string; workspaceName: string; role: string; joinedAt: Date };

const RANK: Record<SessionCtx["role"], number> = { member: 0, admin: 1, owner: 2 };

/** Better Auth stores several roles as "admin,member": the highest one counts; anything unknown is a member. */
export function toRole(role: string): SessionCtx["role"] {
  let best: SessionCtx["role"] = "member"; // least privilege for a role this app does not know
  for (const part of role.split(",").map((r) => r.trim())) {
    if (part in RANK && RANK[part as SessionCtx["role"]] > RANK[best]) best = part as SessionCtx["role"];
  }
  return best;
}

/** The active workspace if the user still belongs to it, else the one they joined first (their personal one). */
export function pickMembership(memberships: Membership[], activeId: string | null): Membership | null {
  const active = memberships.find((m) => m.workspaceId === activeId);
  if (active) return active;
  const byAge = [...memberships].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
  return byAge[0] ?? null;
}

export function toSessionCtx(user: { id: string; name: string; email: string }, m: Membership): SessionCtx {
  return {
    userId: user.id,
    userName: user.name.trim() || user.email, // Google can return an account without a name
    email: user.email,
    workspaceId: m.workspaceId,
    workspaceName: m.workspaceName,
    role: toRole(m.role),
  };
}

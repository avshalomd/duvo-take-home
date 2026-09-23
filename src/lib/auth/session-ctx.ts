import type { SessionCtx } from "@/contracts/auth";

export type Membership = { workspaceId: string; workspaceName: string; role: string; joinedAt: Date };

export function toSessionCtx(_user: { id: string; name: string; email: string }, _m: Membership): SessionCtx {
  throw new Error("not implemented"); // STUB
}
export function pickMembership(_memberships: Membership[], _activeId: string | null): Membership | null {
  throw new Error("not implemented"); // STUB
}
export function toRole(_role: string): SessionCtx["role"] {
  throw new Error("not implemented"); // STUB
}

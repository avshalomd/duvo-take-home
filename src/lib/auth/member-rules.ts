import type { SessionCtx } from "@/contracts/auth";
import { canChangeSettings } from "./roles";

// Who may remove whom from a workspace, and who may change whose role (Q169). Pure: no database, no Better Auth.
// Better Auth checks roles too, but some of its refusals do not fit the case ("you cannot leave the organization as
// the only owner" when an admin removes an owner), and a rule written here holds whatever a later version decides.
// Each function returns the sentence the person reads, or null when the change may go ahead.

type Role = SessionCtx["role"];

/** Someone in the workspace: the user, and their role in it. */
export type Person = { userId: string; role: Role };

/** A refusal written for the person who asked: the actions show its message as it is. */
export class MemberChangeError extends Error {}

export const ONLY_MANAGERS_REMOVE = "Only an owner or an admin can remove people from this workspace.";
export const ONLY_MANAGERS_CHANGE_ROLES = "Only an owner or an admin can change someone's role.";
// One answer for a membership removed meanwhile and for another workspace's: an id says nothing about other workspaces
export const MEMBER_NOT_FOUND = "That person could not be found in this workspace. Reload the page to see who is in it.";
const LAST_OWNER = "A workspace needs an owner. Make someone else an owner first.";

/** `owners`: how many owners the workspace has now. */
export function removalRefusal(actor: Person, target: Person, owners: number): string | null {
  if (!canChangeSettings(actor.role)) return ONLY_MANAGERS_REMOVE;
  if (actor.userId === target.userId) return "You cannot remove yourself here."; // leaving is its own action, not this one
  if (target.role === "owner" && actor.role !== "owner") return "Only an owner can remove an owner.";
  if (target.role === "owner" && owners <= 1) return LAST_OWNER;
  return null;
}

export function roleChangeRefusal(actor: Person, target: Person, to: Role, owners: number): string | null {
  if (!canChangeSettings(actor.role)) return ONLY_MANAGERS_CHANGE_ROLES;
  if (actor.userId === target.userId) return "You cannot change your own role here."; // your own row has no controls either
  if (target.role === "owner" && actor.role !== "owner") return "Only an owner can change an owner's role.";
  if (to === "owner" && actor.role !== "owner") return "Only an owner can make someone an owner.";
  if (target.role === "owner" && to !== "owner" && owners <= 1) return LAST_OWNER;
  return null;
}

const ROLES: Role[] = ["member", "admin", "owner"];

/** The roles the Members page offers on someone's row: the ones the server would accept, so none on your own. */
export function rolesOffered(actor: Person, target: Person, owners: number): Role[] {
  return ROLES.filter((to) => roleChangeRefusal(actor, target, to, owners) === null);
}

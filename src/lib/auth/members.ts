import "server-only";
import type { InviteMember, ListMembers, ListWorkspaces } from "@/contracts/auth";

export const listMembers: ListMembers = async () => []; // STUB
export const listWorkspaces: ListWorkspaces = async () => []; // STUB
export const inviteMember: InviteMember = async () => {
  throw new Error("not implemented: inviteMember"); // STUB
};

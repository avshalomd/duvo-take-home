import "server-only";
import type { InviteMember, ListMembers, ListWorkspaces } from "@/contracts/auth";

export const listMembers: ListMembers = async () => []; // STUB
export const listWorkspaces: ListWorkspaces = async () => []; // STUB
export const inviteMember: InviteMember = async () => {
  throw new Error("not implemented: inviteMember"); // STUB
};
export const createInvite = async (_headers: Headers, ..._args: Parameters<InviteMember>): Promise<{ link: string }> => {
  throw new Error("not implemented: createInvite"); // STUB
};

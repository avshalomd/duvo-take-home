import type { Metadata } from "next";
import { PendingInvitations } from "@/components/auth/pending-invitations";
import { MembersList } from "@/components/settings/members-list";
import { listInvitations, listMembers } from "@/lib/auth/members";
import { canChangeSettings } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage() {
  const session = await requireSession();
  // every action checks the role again: hiding the controls from members is for clarity, not the protection
  const canManage = canChangeSettings(session.role);
  // side by side, not one after the other; a plain member is not shown the invitations, so they are not read
  const [members, invitations] = await Promise.all([listMembers(session.workspaceId), canManage ? listInvitations(session) : []]);
  return (
    <div className="space-y-8">
      <MembersList members={members} viewer={session} />
      {/* open invitations with Copy link and Revoke (Q109): owners and admins only, since each row holds its link's id */}
      {canManage && <PendingInvitations invitations={invitations} />}
    </div>
  );
}

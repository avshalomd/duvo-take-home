import { PendingInvitations } from "@/components/auth/pending-invitations";
import { MembersList } from "@/components/settings/members-list";
import { listMembers } from "@/lib/auth/members";
import { canChangeSettings } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";

export default async function MembersPage() {
  const session = await requireSession();
  const members = await listMembers(session.workspaceId);
  // every action checks the role again: hiding the controls from members is for clarity, not the protection
  const canManage = canChangeSettings(session.role);
  return (
    <div className="space-y-8">
      <MembersList members={members} viewer={session} />
      {/* open invitations with Copy link and Revoke (Q109): owners and admins only, since each row holds its link's id */}
      {canManage && <PendingInvitations ctx={session} />}
    </div>
  );
}

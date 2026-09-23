import { PendingInvitations } from "@/components/auth/pending-invitations";
import { MembersList } from "@/components/settings/members-list";
import { listMembers } from "@/lib/auth/members";
import { canChangeSettings } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";

export default async function MembersPage() {
  const session = await requireSession();
  const members = await listMembers(session.workspaceId);
  // the invite action checks the role again: hiding the invite row is for clarity, not the protection
  const canManage = canChangeSettings(session.role);
  return (
    <div className="space-y-8">
      <MembersList members={members} currentUserId={session.userId} canInvite={canManage} />
      {/* open invitations with Copy link and Revoke (Q109): owners and admins only, since each row holds its link's id */}
      {canManage && <PendingInvitations ctx={session} />}
    </div>
  );
}

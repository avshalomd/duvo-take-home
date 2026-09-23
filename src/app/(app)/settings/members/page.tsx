import { PendingInvitations } from "@/components/auth/pending-invitations";
import { MembersList } from "@/components/settings/members-list";
import { listMembers } from "@/lib/auth/members";
import { canChangeSettings } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";

export default async function MembersPage() {
  const session = await requireSession();
  const members = await listMembers(session.workspaceId);
  // the invite action checks the role again: hiding the row is for clarity, not the protection
  const canManage = canChangeSettings(session.role);
  return (
    <div className="space-y-8">
      <MembersList members={members} currentUserId={session.userId} canInvite={canManage} />
      {/* the auth package's list of open invitations, with Copy link and Revoke (Q109); nothing until it lands */}
      <PendingInvitations workspaceId={session.workspaceId} canManage={canManage} />
    </div>
  );
}

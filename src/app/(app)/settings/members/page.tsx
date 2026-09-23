import { InviteForm } from "@/components/settings/invite-form";
import { MembersList } from "@/components/settings/members-list";
import { listMembers } from "@/lib/auth/members";
import { requireSession } from "@/lib/auth/session";
import { canChangeSettings } from "@/lib/auth/roles";

export default async function MembersPage() {
  const session = await requireSession();
  const members = await listMembers(session.workspaceId);
  return (
    <div className="space-y-4">
      <MembersList members={members} currentUserId={session.userId} />
      {/* the action checks the role again: hiding the form is for clarity, not the protection */}
      {canChangeSettings(session.role) ? (
        <InviteForm />
      ) : (
        <p className="text-xs text-muted-foreground">Only an owner or an admin can invite people to this workspace.</p>
      )}
    </div>
  );
}

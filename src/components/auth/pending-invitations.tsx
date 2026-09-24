import { invitationLine } from "@/lib/auth/invitation-line";
import type { PendingInvitation } from "@/lib/auth/members";
import { InvitationActions } from "./invitation-actions";

// The workspace's pending invitations with Copy link and Revoke (QA Q109). The auth package builds it on its own
// members library; the Settings > Members page reads them (listInvitations, beside the members, not after them)
// and renders this under the member list, for owners and admins only (each row carries its invitation's id, which
// is its link, even as a React key). Nothing at all when there are none.
export function PendingInvitations({ invitations }: { invitations: PendingInvitation[] }) {
  if (invitations.length === 0) return null;
  const now = new Date(); // one clock for the whole list, so two rows made together say the same time left

  return (
    <section aria-labelledby="pending-invitations" className="flex flex-col gap-2">
      <h2 id="pending-invitations" className="px-4 text-[13px] font-medium tracking-[0.01em] text-slate">
        Invited, not joined yet
      </h2>
      <ul data-testid="pending-invitations" className="divide-y divide-hairline overflow-hidden rounded-2xl bg-paper shadow-tile">
        {invitations.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <div className="min-w-0 flex-1 basis-56">
              <p className="truncate text-[15px] font-medium">{i.email}</p>
              <p className="text-[13px] tracking-[0.01em] text-slate">{invitationLine(i.role, new Date(i.expiresAt), now)}</p>
            </div>
            <InvitationActions id={i.id} email={i.email} link={i.link} />
          </li>
        ))}
      </ul>
      <p className="px-4 text-[13px] tracking-[0.01em] text-slate">No email is sent. Copy a link and send it yourself.</p>
    </section>
  );
}

import type { Member } from "@/contracts/auth";
import { InsetGroup, rowLine } from "./grouped";
import { InviteRow } from "./invite-form";

const ROLE: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };

// The people of the workspace as rows (initials, name, email, role at the end), with "Invite someone" as the last
// row for owners and admins. Roles are changed through Better Auth's own tools for now, so the role is a value.
export function MembersList({ members, currentUserId, canInvite }: { members: Member[]; currentUserId: string; canInvite: boolean }) {
  return (
    <InsetGroup
      title="People in this workspace"
      data-testid="members"
      footer={
        canInvite
          ? "Everyone here sees the workspace's runs, automations and servers."
          : "Everyone here sees the workspace's runs, automations and servers. Only an owner or an admin can invite people."
      }
    >
      {members.length === 0 && <li className="px-4 py-4 text-slate">No one to show yet.</li>}
      {members.map((m) => (
        <li key={m.userId} className={rowLine("glyph")}>
          <div className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">
            <span aria-hidden className="grid size-[30px] shrink-0 place-items-center rounded-full bg-graphite/[0.08] text-[12px] font-semibold">
              {initials(m.name || m.email)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {m.name}
                {m.userId === currentUserId && <span className="font-normal text-slate"> (you)</span>}
              </p>
              <p className="truncate text-[13px] tracking-[0.01em] text-slate">{m.email}</p>
            </div>
            <span className="shrink-0 text-slate">{ROLE[m.role] ?? m.role}</span>
          </div>
        </li>
      ))}
      {canInvite && <InviteRow />}
    </InsetGroup>
  );
}

// "Ada Lovelace" -> "AL"; one word -> its first letter. A mark to find a row by, not a picture.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0]?.[0] ?? "?")).toUpperCase();
}

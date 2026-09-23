import type { Member, SessionCtx } from "@/contracts/auth";
import { removalRefusal, rolesOffered } from "@/lib/auth/member-rules";
import { canChangeSettings } from "@/lib/auth/roles";
import { toRole } from "@/lib/auth/session-ctx";
import { InsetGroup, rowLine } from "./grouped";
import { InviteRow } from "./invite-form";
import { MemberActions } from "./member-actions";

const ROLE: Record<SessionCtx["role"], string> = { owner: "Owner", admin: "Admin", member: "Member" };

// The people of the workspace as rows (initials, name, email, role at the end), with "Invite someone" as the last
// row for owners and admins. For them the role is a menu on the rows the server would let them change (Q169): the
// same rules decide what is offered here and what the actions accept. Everyone else reads the role as a value.
export function MembersList({ members, viewer }: { members: Member[]; viewer: Pick<SessionCtx, "userId" | "role"> }) {
  const canManage = canChangeSettings(viewer.role);
  const owners = members.filter((m) => toRole(m.role) === "owner").length;
  return (
    <InsetGroup
      title="People in this workspace"
      data-testid="members"
      footer={
        canManage
          ? `Everyone here sees the workspace's runs, automations and servers. Press someone's role to change it or to remove them.${viewer.role === "admin" ? " Only an owner can change an owner." : ""}`
          : "Everyone here sees the workspace's runs, automations and servers. Only an owner or an admin can invite people."
      }
    >
      {members.length === 0 && <li className="px-4 py-4 text-slate">No one to show yet.</li>}
      {members.map((m) => {
        const person = { userId: m.userId, role: toRole(m.role) };
        const roles = rolesOffered(viewer, person, owners);
        const mayRemove = removalRefusal(viewer, person, owners) === null;
        return (
          <li key={m.userId} className={rowLine("glyph")}>
            <div className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">
              <span aria-hidden className="grid size-[30px] shrink-0 place-items-center rounded-full bg-graphite/[0.08] text-[12px] font-semibold">
                {initials(m.name || m.email)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {m.name}
                  {m.userId === viewer.userId && <span className="font-normal text-slate"> (you)</span>}
                </p>
                <p className="truncate text-[13px] tracking-[0.01em] text-slate">{m.email}</p>
              </div>
              {roles.length > 0 || mayRemove ? (
                <MemberActions memberId={m.memberId} name={m.name || m.email} role={person.role} roles={roles} mayRemove={mayRemove} />
              ) : (
                <span className="shrink-0 text-slate">{ROLE[person.role]}</span>
              )}
            </div>
          </li>
        );
      })}
      {canManage && <InviteRow />}
    </InsetGroup>
  );
}

// "Ada Lovelace" -> "AL"; one word -> its first letter. A mark to find a row by, not a picture.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0]?.[0] ?? "?")).toUpperCase();
}

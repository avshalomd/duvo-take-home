import type { Member } from "@/contracts/auth";

const ROLE: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };

// Who is in the workspace, and what each person may do. Read-only: roles change through Better Auth's own tools for now.
export function MembersList({ members, currentUserId }: { members: Member[]; currentUserId: string }) {
  return (
    <section className="rounded-xl border bg-background">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Members</h2>
        <p className="text-xs text-muted-foreground">Everyone here sees the workspace&apos;s runs, automations and connections.</p>
      </div>
      {members.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No members to show yet.</p>
      ) : (
        <ul data-testid="members" className="divide-y">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.name}
                  {m.userId === currentUserId && <span className="font-normal text-muted-foreground"> (you)</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>
              <span className="text-xs text-muted-foreground">{joined(m.joinedAt)}</span>
              <span className="w-16 text-right text-sm">{ROLE[m.role] ?? m.role}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// A date, not a time: when someone joined matters to the day. UTC, so the server and the browser agree on it.
function joined(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `joined ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
}

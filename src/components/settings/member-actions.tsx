"use client";

import { ChevronsUpDown, LoaderCircle, UserMinus } from "lucide-react";
import { useOptimistic, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { changeMemberRoleAction, removeMemberAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionCtx } from "@/contracts/auth";
import { cn } from "@/lib/utils";
import { SHEET, SHEET_DESCRIPTION, SHEET_TITLE, SheetActions } from "./sheet";

type Role = SessionCtx["role"];

const ROLE_NAME: Record<Role, string> = { owner: "Owner", admin: "Admin", member: "Member" };
// What each role may do, short enough for one line on a phone, so the choice is made knowing what it gives
const ROLE_MEANS: Record<Role, string> = {
  member: "Runs tasks, builds automations and tries them",
  admin: "Also approves automations and manages settings and people", // Q178: approving is theirs, not a member's
  owner: "Can also make and remove owners",
};
const item = "rounded-xl px-2.5 py-2 text-[15px] gap-2.5";

/**
 * The trailing control of someone's row on the Members page, for an owner or an admin (Q169): their role as a
 * pop-up button, as iOS Settings draws a value you can change. The menu holds the roles the server would accept
 * (`roles`) and, when allowed, Remove. Removing asks first, naming the person and what they lose; so does making
 * someone an owner, the one change the person making it may not be able to undo. The rules are the server's.
 */
export function MemberActions({ memberId, name, role, roles, mayRemove }: { memberId: string; name: string; role: Role; roles: Role[]; mayRemove: boolean }) {
  const [shown, showRole] = useOptimistic(role); // the new role at once; back to the page's own if the server refuses
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<"remove" | "owner" | null>(null);

  function changeTo(next: Role) {
    setConfirming(null);
    startTransition(async () => {
      showRole(next);
      const result = await changeMemberRoleAction(memberId, next);
      if (result.error) toast.error(result.error);
      else toast.success(`${name} is now ${next === "admin" ? "an admin" : next === "owner" ? "an owner" : "a member"}.`);
    });
  }

  function pick(next: string) {
    if (next === shown) return;
    if (next === "owner") setConfirming("owner"); // asked first: see above
    else changeTo(next as Role);
  }

  function remove() {
    startTransition(async () => {
      const result = await removeMemberAction(memberId);
      setConfirming(null); // either way the question is answered: a refusal is said in the toast, not behind the sheet
      if (result.error) toast.error(result.error);
      else toast.success(`${name} was removed from the workspace.`); // the row leaves as the page re-renders
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${ROLE_NAME[shown]}: change ${name}'s role${mayRemove ? " or remove them" : ""}`}
          aria-busy={pending}
          className={cn(
            "-mr-2 flex h-9 shrink-0 items-center gap-1 rounded-full pr-2 pl-3 text-slate transition-[transform,background-color] duration-100",
            "hover:bg-graphite/5 active:scale-[0.97] data-[popup-open]:bg-graphite/5",
            "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          )}
        >
          {ROLE_NAME[shown]}
          {pending ? <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> : <ChevronsUpDown aria-hidden className="size-3.5" />}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className="glass w-72 max-w-[calc(100vw-1.5rem)] rounded-[18px] p-1.5 text-graphite ring-0"
          // the same edge as the user menu: glass's own shadow alone left no edge on the white page
          style={{ boxShadow: "inset 0 1px 0 var(--glass-edge), 0 0 0 1px var(--hairline), var(--shadow-float)" }}
        >
          <DropdownMenuRadioGroup value={shown} onValueChange={pick}>
            {roles.map((r) => (
              // closeOnClick: a role is picked like a select's option; Base UI keeps a radio menu open by default
              <DropdownMenuRadioItem key={r} value={r} closeOnClick className={cn(item, "pr-9")}>
                <span className="flex flex-col">
                  <span>{ROLE_NAME[r]}</span>
                  <span className="text-[13px] tracking-[0.01em] text-slate">{ROLE_MEANS[r]}</span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {mayRemove && (
            <>
              <DropdownMenuSeparator className="mx-1 bg-hairline" />
              <DropdownMenuItem className={cn(item, "text-crimson focus:bg-crimson-wash focus:text-crimson")} onClick={() => setConfirming("remove")}>
                <UserMinus aria-hidden className="text-crimson" />
                Remove from workspace
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Confirm
        open={confirming === "remove"}
        onCancel={() => setConfirming(null)}
        title={`Remove ${name}?`}
        description="They lose access to this workspace's runs, automations and connections. You can invite them again later."
      >
        {/* paper text, not white: in dark mode crimson is light and needs dark text */}
        <Button type="button" size="lg" onClick={remove} disabled={pending} className="bg-crimson px-5 text-paper hover:bg-crimson/90">
          {pending && <LoaderCircle className="size-3.5 animate-spin" />}
          Remove
        </Button>
      </Confirm>
      <Confirm
        open={confirming === "owner"}
        onCancel={() => setConfirming(null)}
        title={`Make ${name} an owner?`}
        description="An owner can do everything here, including changing your role or removing you."
      >
        <Button type="button" size="lg" onClick={() => changeTo("owner")} className="px-5">
          Make owner
        </Button>
      </Confirm>
    </>
  );
}

/** A question as a paper sheet: what will happen, Cancel, and the action (children). One per question, so each keeps its words while it closes. */
function Confirm({ open, onCancel, title, description, children }: { open: boolean; onCancel: () => void; title: string; description: string; children: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className={`${SHEET} sm:max-w-[400px]`} showCloseButton={false}>
        <div className="space-y-1.5 px-6 pt-6 pb-4">
          <DialogTitle className={SHEET_TITLE}>{title}</DialogTitle>
          <DialogDescription className={SHEET_DESCRIPTION}>{description}</DialogDescription>
        </div>
        <SheetActions>
          <Button type="button" size="lg" variant="ghost" onClick={onCancel} className="px-4">
            Cancel
          </Button>
          {children}
        </SheetActions>
      </DialogContent>
    </Dialog>
  );
}

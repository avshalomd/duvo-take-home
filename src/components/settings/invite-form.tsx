"use client";

import { ChevronDown, Copy, LoaderCircle, UserPlus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { inviteMemberAction, type InviteState } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { RowGlyph, rowLine } from "./grouped";
import { submitKeepingValues } from "./submit-keeping-values";

// The field style inside an unfolded row: a recess on the paper, no border, the ring only on focus.
const FIELD = "h-10 rounded-[12px] bg-mist px-3 outline-none placeholder:text-slate/70 focus-visible:ring-2 focus-visible:ring-ring/50 aria-invalid:ring-2 aria-invalid:ring-crimson/60";

/**
 * "Invite someone" as the last row of the people group; it unfolds into the form. No mail is sent (no mail provider
 * is configured), so an invitation is a link the inviter passes on themselves.
 */
export function InviteRow() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteMemberAction, {});
  const form = useRef<HTMLFormElement>(null);
  const levelId = useId();
  const emailError = state.fieldErrors?.email?.[0];

  useEffect(() => {
    if (emailError) form.current?.querySelector<HTMLInputElement>("#invite-email")?.focus();
  }, [emailError]);

  // once a link is made, the form empties for the next person; a refused address stays in the field to be corrected
  useEffect(() => {
    if (state.link) form.current?.reset();
  }, [state.link]);

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      toast.error("Copying is blocked here: select the link and copy it by hand"); // clipboard needs a secure context and a focused page
    }
  }

  return (
    <li data-testid="invite" className={rowLine("glyph")}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={levelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left font-medium transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-muted"
      >
        <RowGlyph className="bg-graphite text-paper">
          <UserPlus strokeWidth={2.25} />
        </RowGlyph>
        <span className="flex-1">Invite someone</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-slate" aria-hidden>
          <ChevronDown className="size-4" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={levelId}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            className="space-y-3 pr-4 pb-4 pl-4 sm:pl-[58px]"
          >
            <p className="text-[13px] tracking-[0.01em] text-slate">
              You get a link to send them. A member runs and builds automations; an admin can also change settings and invite people.
            </p>
            {/* the address gets the whole width; the role and the button share the line under it */}
            <form ref={form} onSubmit={(e) => submitKeepingValues(e, action)} className="grid grid-cols-[1fr_auto] gap-2">
              <label htmlFor="invite-email" className="sr-only">
                Email
              </label>
              <input
                id="invite-email"
                name="email"
                type="email"
                placeholder="Their email, like colleague@example.com"
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? "invite-email-error" : undefined}
                className={`${FIELD} col-span-2`}
              />
              <label htmlFor="invite-role" className="sr-only">
                Role
              </label>
              <select id="invite-role" name="role" defaultValue="member" className={`${FIELD} min-w-0 cursor-pointer pr-2`}>
                {/* the roles' meaning is the line above: a phone's menu cuts long options short */}
                <option value="member">As a member</option>
                <option value="admin">As an admin</option>
              </select>
              <Button type="submit" size="lg" disabled={pending} className="h-10 px-5">
                {pending && <LoaderCircle className="size-3.5 animate-spin" />}
                {pending ? "Creating..." : "Create invite link"}
              </Button>
            </form>
            {emailError && (
              <p id="invite-email-error" role="alert" className="text-[13px] text-crimson">
                {emailError}
              </p>
            )}
            {state.error && (
              <p role="alert" className="text-[13px] text-crimson">
                {state.error}
              </p>
            )}
            {state.link && (
              <div data-testid="invite-link" className="space-y-2 rounded-[16px] bg-fern-wash p-3.5">
                <p className="text-[13px]">Send this link to {state.email}. Opening it lets them join.</p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={state.link}
                    aria-label="Invite link"
                    onFocus={(e) => e.currentTarget.select()}
                    className="h-9 min-w-0 flex-1 rounded-[12px] bg-paper px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                  <Button type="button" size="lg" variant="outline" onClick={() => copy(state.link!)}>
                    <Copy /> Copy
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

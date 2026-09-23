"use client";

import { Copy, LoaderCircle } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { inviteMemberAction, type InviteState } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitKeepingValues } from "./submit-keeping-values";

// No mail is sent (no mail provider is configured), so an invitation is a link the inviter passes on themselves.
export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteMemberAction, {});
  const form = useRef<HTMLFormElement>(null);
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
    <section className="space-y-3 rounded-xl border bg-background p-4">
      <div>
        <h2 className="text-sm font-semibold">Invite someone</h2>
        <p className="text-xs text-muted-foreground">You get a link to send them. It lets them join this workspace.</p>
      </div>
      <form ref={form} onSubmit={(e) => submitKeepingValues(e, action)} className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1 space-y-1">
          <Label htmlFor="invite-email" className="text-xs">
            Email
          </Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            placeholder="colleague@example.com"
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? "invite-email-error" : undefined}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="invite-role" className="text-xs">
            Role
          </Label>
          <select
            id="invite-role"
            name="role"
            defaultValue="member"
            className="h-8 rounded-lg border bg-transparent px-2 text-sm"
          >
            <option value="member">Member: runs and builds automations</option>
            <option value="admin">Admin: also changes settings and invites</option>
          </select>
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <LoaderCircle className="size-3.5 animate-spin" />}
          {pending ? "Creating..." : "Create invite link"}
        </Button>
      </form>
      {emailError && (
        <p id="invite-email-error" role="alert" className="text-xs text-red-600 dark:text-red-400">
          {emailError}
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state.link && (
        <div data-testid="invite-link" className="space-y-1.5 rounded-lg bg-muted/60 p-3">
          <p className="text-xs">Send this link to {state.email}. Opening it lets them join.</p>
          <div className="flex gap-2">
            <Input readOnly value={state.link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            <Button type="button" size="sm" variant="outline" onClick={() => copy(state.link!)}>
              <Copy /> Copy
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

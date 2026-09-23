"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createWorkspace, type NewWorkspaceState } from "@/lib/auth/actions";
import { AuthField } from "./auth-field";
import { FormError } from "./form-error";

// Opened from the user menu. On success the action makes the new workspace active and opens Home.
export function NewWorkspaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [state, action, pending] = useActionState<NewWorkspaceState, FormData>(createWorkspace, {});
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 rounded-[22px] bg-paper p-6 shadow-float ring-0 sm:max-w-[26rem]">
        <DialogHeader className="gap-1.5">
          <DialogTitle className="display text-[26px]">New workspace</DialogTitle>
          <DialogDescription className="text-[15px] text-slate">A separate place for runs, connections and automations. You can invite people to it later.</DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-4">
          {/* the returned name refills the field: React resets a form after its action runs */}
          <AuthField id="workspace-name" label="Name" name="name" required maxLength={60} defaultValue={state.name} placeholder="For example, Finance team" autoFocus />
          <FormError message={state.error} />
          <Button type="submit" className="h-11 w-full text-[15px]" disabled={pending}>
            {pending ? "Creating..." : "Create workspace"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

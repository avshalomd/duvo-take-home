"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWorkspace, type NewWorkspaceState } from "@/lib/auth/actions";
import { FormError } from "./form-error";

// Opened from the user menu. On success the action makes the new workspace active and opens Home.
export function NewWorkspaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [state, action, pending] = useActionState<NewWorkspaceState, FormData>(createWorkspace, {});
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
          <DialogDescription>A separate place for runs, connections and automations. You can invite people to it later.</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="workspace-name">Name</Label>
            {/* the returned name refills the field: React resets a form after its action runs */}
            <Input id="workspace-name" name="name" required maxLength={60} defaultValue={state.name} placeholder="e.g. Finance team" autoFocus />
          </div>
          <FormError message={state.error} />
          <Button type="submit" className="h-9 w-full" disabled={pending}>
            {pending ? "Creating..." : "Create workspace"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

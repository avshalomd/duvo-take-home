"use client";

import { LoaderCircle } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { deleteConnectionAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Connection } from "@/contracts/connection";

// Deleting cannot be undone and takes a saved token with it, so it asks first, naming the server.
export function DeleteConnectionDialog({
  connection,
  open,
  onOpenChange,
}: {
  connection: Connection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await deleteConnectionAction(connection.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${connection.name} deleted`);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {connection.name}?</DialogTitle>
          <DialogDescription>
            New runs will no longer be able to use it{connection.hasToken ? ", and its saved token is removed" : ""}. Past runs keep their
            record.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" variant="destructive" onClick={confirm} disabled={pending}>
            {pending && <LoaderCircle className="size-3.5 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

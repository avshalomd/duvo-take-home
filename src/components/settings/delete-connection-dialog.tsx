"use client";

import { LoaderCircle } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { deleteConnectionAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Connection } from "@/contracts/connection";
import { SHEET, SHEET_DESCRIPTION, SHEET_TITLE, SheetActions } from "./sheet";

// Deleting cannot be undone and takes a saved token with it, so it asks first, naming the connection.
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
      <DialogContent className={`${SHEET} sm:max-w-[380px]`} showCloseButton={false}>
        <div className="space-y-1.5 px-6 pt-6 pb-4">
          <DialogTitle className={SHEET_TITLE}>Delete {connection.name}?</DialogTitle>
          <DialogDescription className={SHEET_DESCRIPTION}>
            New runs will no longer be able to use it{connection.hasToken ? ", and its saved token is removed" : ""}. Past runs keep their
            record.
          </DialogDescription>
        </div>
        <SheetActions>
          <Button type="button" size="lg" variant="ghost" onClick={() => onOpenChange(false)} className="px-4">
            Cancel
          </Button>
          {/* paper text, not white: in dark mode crimson is light and needs dark text */}
          <Button type="button" size="lg" onClick={confirm} disabled={pending} className="bg-crimson px-5 text-paper hover:bg-crimson/90">
            {pending && <LoaderCircle className="size-3.5 animate-spin" />}
            Delete
          </Button>
        </SheetActions>
      </DialogContent>
    </Dialog>
  );
}

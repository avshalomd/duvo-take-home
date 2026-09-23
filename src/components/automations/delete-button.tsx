"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState, useState } from "react";
import { deleteAutomationAction, type ActionState } from "@/app/(app)/automations/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SHEET, SHEET_DESCRIPTION, SHEET_TITLE, SheetActions } from "@/components/settings/sheet";

// Delete cannot be undone, so it asks first on the same paper sheet as Remove on the Members page (UX R2), naming the
// automation and the command people would lose. The automation's runs stay: they are the record of what happened.
// Only owners and admins get this button (Q178); a refusal from the server still reads on the sheet as a sentence.
export function DeleteButton({ automationId, name, command, approved }: { automationId: string; name: string; command: string; approved: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteAutomationAction, {});
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setAsking(true)} className="h-10 px-4 text-[15px] text-crimson hover:bg-crimson-wash hover:text-crimson">
        Delete
      </Button>
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent className={`${SHEET} sm:max-w-[400px]`} showCloseButton={false}>
          <form action={action}>
            <input type="hidden" name="id" value={automationId} />
            <div className="space-y-1.5 px-6 pt-6 pb-4">
              <DialogTitle className={SHEET_TITLE}>Delete &quot;{name}&quot;?</DialogTitle>
              <DialogDescription className={SHEET_DESCRIPTION}>
                {/* a draft was never called by its command; an approved one (Ready or Off) has one people know */}
                {approved && `/${command} stops working. `}Its past runs stay in the history.
              </DialogDescription>
            </div>
            <SheetActions error={state.error}>
              <Button type="button" size="lg" variant="ghost" onClick={() => setAsking(false)} className="px-4">
                Cancel
              </Button>
              {/* paper text, not white: in dark mode crimson is light and needs dark text */}
              <Button type="submit" size="lg" disabled={pending} className="bg-crimson px-5 text-paper hover:bg-crimson/90">
                {pending && <LoaderCircle className="size-3.5 animate-spin" />}
                Delete
              </Button>
            </SheetActions>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

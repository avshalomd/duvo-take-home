"use client";

import { LoaderCircle, ShieldCheck } from "lucide-react";
import { useActionState } from "react";
import { approveAction, type ActionState } from "@/app/(app)/automations/actions";
import { Button } from "@/components/ui/button";

// "Approve and save", enabled by canApprove() on the server. When it is disabled the reason says what is missing,
// so the person is never left guessing why the button will not press.
export function ApproveForm({ automationId, allowed, reason }: { automationId: string; allowed: boolean; reason: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(approveAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-600/20 bg-emerald-50/50 p-4 dark:bg-emerald-950/30">
      <input type="hidden" name="id" value={automationId} />
      <Button type="submit" disabled={!allowed || pending} className="bg-emerald-700 text-white hover:bg-emerald-800">
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
        Approve and save
      </Button>
      <p data-testid="approve-reason" aria-live="polite" className="text-sm text-muted-foreground">
        {state.error ?? (allowed ? "An example of this version looks right. Approve it to use it from Home." : reason)}
      </p>
    </form>
  );
}

"use client";

import { LoaderCircle, Power } from "lucide-react";
import { useActionState } from "react";
import { setStatusAction, type ActionState } from "@/app/(app)/automations/actions";
import { Button } from "@/components/ui/button";

// Turn off keeps everything - template, examples, history - and only stops the command and the schedule from running it.
export function StatusToggle({ automationId, active }: { automationId: string; active: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setStatusAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={automationId} />
      <input type="hidden" name="status" value={active ? "disabled" : "active"} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Power className="size-3.5" />}
        {active ? "Turn off" : "Turn on"}
      </Button>
      {state.error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}

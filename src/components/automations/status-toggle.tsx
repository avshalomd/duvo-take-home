"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState } from "react";
import { setStatusAction, type ActionState } from "@/app/(app)/automations/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SMALL } from "./surfaces";

// Turn off, beside the status, with one line of what it does (Q106): it keeps everything and only stops the command
// and the schedule from starting it.
export function StatusToggle({ automationId, command, active }: { automationId: string; command: string; active: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setStatusAction, {});
  return (
    <form action={action} className="contents">
      <input type="hidden" name="id" value={automationId} />
      <input type="hidden" name="status" value={active ? "disabled" : "active"} />
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="h-8 px-3">
        {pending && <LoaderCircle className="size-3.5 animate-spin" />}
        {active ? "Turn off" : "Turn on"}
      </Button>
      {/* polite: a refusal replaces this line, and a screen reader reads it out (as on the approval bar) */}
      <p aria-live="polite" className={cn(SMALL, "basis-full sm:basis-auto", state.error && "text-crimson")}>
        {state.error ??
          (active
            ? `Turning it off stops /${command} from starting, by hand or on its schedule. Nothing is deleted.`
            : `/${command} and its schedule start nothing until you turn it on. Nothing is deleted.`)}
      </p>
    </form>
  );
}

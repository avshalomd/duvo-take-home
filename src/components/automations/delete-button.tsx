"use client";

import { useActionState } from "react";
import { deleteAutomationAction, type ActionState } from "@/app/(app)/automations/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SMALL } from "./surfaces";

// Delete is quiet and asks once, because it cannot be undone. The automation's runs stay: they are the record of what
// happened. Only owners and admins get this button (Q178); a refusal from the server still reads here as a sentence.
export function DeleteButton({ automationId, name }: { automationId: string; name: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteAutomationAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`Delete "${name}"? Its past runs stay in the history.`)) e.preventDefault();
      }}
      className="flex flex-wrap items-center justify-end gap-2"
    >
      <input type="hidden" name="id" value={automationId} />
      {state.error && (
        <p role="alert" className={cn(SMALL, "text-crimson")}>
          {state.error}
        </p>
      )}
      <Button type="submit" variant="ghost" disabled={pending} className="h-10 px-4 text-[15px] text-slate hover:text-crimson">
        Delete
      </Button>
    </form>
  );
}

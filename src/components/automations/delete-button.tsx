"use client";

import { Trash2 } from "lucide-react";
import { deleteAutomationAction } from "@/app/(app)/automations/actions";
import { Button } from "@/components/ui/button";

// Delete asks once, because it cannot be undone. The automation's runs stay: they are the record of what happened.
export function DeleteButton({ automationId, name }: { automationId: string; name: string }) {
  return (
    <form
      action={deleteAutomationAction}
      onSubmit={(e) => {
        if (!window.confirm(`Delete "${name}"? Its past runs stay in the history.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={automationId} />
      <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
        <Trash2 className="size-3.5" />
        Delete
      </Button>
    </form>
  );
}

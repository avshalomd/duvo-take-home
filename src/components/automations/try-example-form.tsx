"use client";

import { FlaskConical, LoaderCircle } from "lucide-react";
import { useActionState } from "react";
import { startTrialAction, type ActionState } from "@/app/(app)/automations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// "Run example": a real run of the current version on the input typed here. The first one is offered the value the
// source run used, so the first try needs no typing.
export function TryExampleForm({ automationId, inputLabel, inputHint, suggested }: { automationId: string; inputLabel: string; inputHint: string; suggested: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(startTrialAction, {});
  return (
    <form action={action} className="space-y-1.5">
      <input type="hidden" name="id" value={automationId} />
      <label htmlFor="example-input" className="text-sm font-medium">
        Example input
        <span className="ml-1 font-normal text-muted-foreground">({inputLabel})</span>
      </label>
      <div className="flex gap-2">
        <Input id="example-input" name="input" placeholder={inputHint || inputLabel} defaultValue={state.values?.input ?? suggested} className="h-9" />
        <Button type="submit" disabled={pending} className="h-9 bg-emerald-700 text-white hover:bg-emerald-800">
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
          {pending ? "Starting..." : "Run example"}
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}

"use client";

import { LoaderCircle, Play } from "lucide-react";
import { useActionState } from "react";
import { runNowAction, type ActionState } from "@/app/(app)/automations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// "Run" for a ready automation: one input and a button. It goes through runCommand, the same path as typing
// \command input on Home, so both refuse in the same words (a connection that is off, an empty input).
export function RunBox({ automationId, inputLabel, placeholder }: { automationId: string; inputLabel: string; placeholder: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(runNowAction, {});
  const inputId = `run-input-${automationId}`;
  return (
    <form action={action} className="space-y-1.5">
      <input type="hidden" name="id" value={automationId} />
      <label htmlFor={inputId} className="sr-only">
        {inputLabel}
      </label>
      <div className="flex gap-2">
        {/* keyed by its default: Base UI's Input warns when a default changes under it, so a new one re-mounts it */}
        <Input
          key={state.values?.input ?? ""}
          id={inputId}
          name="input"
          placeholder={placeholder || inputLabel}
          defaultValue={state.values?.input}
          className="h-8 text-sm"
        />
        <Button type="submit" size="sm" disabled={pending} className="h-8 bg-emerald-700 text-white hover:bg-emerald-800">
          {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          {pending ? "Starting..." : "Run"}
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

"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState } from "react";
import { runNowAction, type ActionState } from "@/app/(app)/automations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CommandChip } from "./brief-text";
import { FIELD, SMALL } from "./surfaces";

// A ready automation's one primary action (Q106): the input, labelled by its name and filled with the example, and
// Run. It goes through runCommand, the same path as typing \command input on Home, so both refuse in the same words.
export function RunForm({ automationId, command, inputLabel, inputHint, inputExample }: { automationId: string; command: string; inputLabel: string; inputHint: string; inputExample: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(runNowAction, {});
  const value = state.values?.input ?? inputExample;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={automationId} />
      <label htmlFor="run-input" className="text-[15px] font-medium text-graphite">
        {inputLabel}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        {/* keyed by its default: Base UI's Input warns when a default changes under it, so a new one re-mounts it */}
        <Input key={value} id="run-input" name="input" placeholder={inputHint || inputLabel} defaultValue={value} className={cn(FIELD, "h-11 min-w-0 flex-1 text-[17px]")} />
        <Button type="submit" disabled={pending} className="h-11 px-6 text-[15px]">
          {pending && <LoaderCircle className="size-4 animate-spin" />}
          Run
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className={cn(SMALL, "text-crimson")}>
          {state.error}
        </p>
      ) : (
        <p className={SMALL}>
          Or type <CommandChip command={command} input={inputExample || undefined} /> on Home.
        </p>
      )}
    </form>
  );
}

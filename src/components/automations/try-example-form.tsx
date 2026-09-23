"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState } from "react";
import { startTrialAction, type ActionState } from "@/app/(app)/automations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FIELD, SMALL } from "./surfaces";

// "Run example": a real run of the current version on the input typed here. The first one is offered the value the
// source run used, so the first try needs no typing. On a ready automation it is the secondary action (Q106).
export function TryExampleForm({
  automationId,
  inputLabel,
  inputHint,
  suggested,
  secondary,
}: {
  automationId: string;
  inputLabel: string;
  inputHint: string;
  suggested: string;
  secondary?: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(startTrialAction, {});
  return (
    <form action={action} className="space-y-1.5">
      <input type="hidden" name="id" value={automationId} />
      <label htmlFor="example-input" className="text-[13px] font-medium tracking-[0.01em] text-slate">
        Example input <span className="font-normal">({inputLabel})</span>
      </label>
      <div className="flex gap-2">
        {/* keyed by its default: Base UI's Input warns when a default changes under it, so a new one re-mounts it */}
        <Input
          key={state.values?.input ?? suggested}
          id="example-input"
          name="input"
          placeholder={inputHint || inputLabel}
          defaultValue={state.values?.input ?? suggested}
          className={cn(FIELD, "min-w-0 flex-1")}
        />
        <Button type="submit" variant={secondary ? "outline" : "default"} disabled={pending} className="h-10 shrink-0 px-4 text-[15px]">
          {pending && <LoaderCircle className="size-4 animate-spin" />}
          Run example
        </Button>
      </div>
      {state.error && (
        <p role="alert" className={cn(SMALL, "text-crimson")}>
          {state.error}
        </p>
      )}
    </form>
  );
}

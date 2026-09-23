"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { updateLimitsAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { WorkspaceLimits } from "@/contracts/usage";

// The workspace's limits and guard switches. useActionState hands back what was typed with the errors, because React
// resets a form after its action runs (CLAUDE.md, "Forms").
export function LimitsForm({ limits, canEdit }: { limits: WorkspaceLimits; canEdit: boolean }) {
  const [state, action, pending] = useActionState(updateLimitsAction, {});
  const submitted = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const v = state.values;
  const errors = state.fieldErrors;

  useEffect(() => {
    if (errors) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  // {} is the only answer that means saved: the toast confirms it, since the form itself looks the same afterwards
  useEffect(() => {
    if (!submitted.current || pending) return;
    submitted.current = false;
    if (state.error) toast.error(state.error);
    else if (!state.fieldErrors) toast.success("Limits saved");
  }, [state, pending]);

  return (
    <form
      ref={form}
      action={action}
      onSubmit={() => {
        submitted.current = true;
      }}
      className="space-y-5 rounded-xl border bg-background p-4"
    >
      <fieldset disabled={!canEdit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            name="dailyBudgetUsd"
            label="Spend per day (USD)"
            hint="Runs stop starting once today's runs cost this much."
            step="0.01"
            min="0"
            defaultValue={v?.dailyBudgetUsd ?? String(limits.dailyBudgetUsd)}
            error={errors?.dailyBudgetUsd?.[0]}
          />
          <NumberField
            name="dailyRunLimit"
            label="Runs per day"
            hint="How many runs can start in one day."
            step="1"
            min="1"
            defaultValue={v?.dailyRunLimit ?? String(limits.dailyRunLimit)}
            error={errors?.dailyRunLimit?.[0]}
          />
          <NumberField
            name="maxInFlight"
            label="Runs at the same time"
            hint="More have to wait for one to finish."
            step="1"
            min="1"
            defaultValue={v?.maxInFlight ?? String(limits.maxInFlight)}
            error={errors?.maxInFlight?.[0]}
          />
        </div>

        <div className="space-y-3">
          <SwitchField
            name="stepChecks"
            label="Check each step as it finishes"
            hint="A quick automatic check after every step, so a run that drifts off track is flagged early."
            defaultChecked={v ? v.stepChecks === "on" : limits.stepChecks}
          />
          <SwitchField
            name="strictConnections"
            label="Block connections the plan did not name"
            hint="When off, the run only notes it. When on, the agent is stopped from using them."
            defaultChecked={v ? v.strictConnections === "on" : limits.strictConnections}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="deniedDomains" className="text-xs">
            Blocked websites
          </Label>
          <p id="deniedDomains-hint" className="text-xs text-muted-foreground">
            One per line, like example.com. The agent will not open pages on these websites.
          </p>
          <Textarea
            id="deniedDomains"
            name="deniedDomains"
            rows={4}
            placeholder={"pastebin.com\nexample.com"}
            defaultValue={v?.deniedDomains ?? limits.deniedDomains.join("\n")}
            aria-invalid={Boolean(errors?.deniedDomains)}
            aria-describedby={errors?.deniedDomains ? "deniedDomains-error" : "deniedDomains-hint"}
          />
          {errors?.deniedDomains && <FieldError id="deniedDomains-error" text={errors.deniedDomains[0]} />}
        </div>
      </fieldset>

      {state.error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {canEdit ? (
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <LoaderCircle className="size-3.5 animate-spin" />}
          {pending ? "Saving..." : "Save limits"}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Only an owner or an admin can change the limits.</p>
      )}
    </form>
  );
}

function NumberField({
  name,
  label,
  hint,
  error,
  ...input
}: {
  name: string;
  label: string;
  hint: string;
  error?: string;
  step: string;
  min: string;
  defaultValue: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name} className="text-xs">
        {label}
      </Label>
      <Input
        id={name}
        name={name}
        type="number"
        inputMode="decimal"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : `${name}-hint`}
        {...input}
      />
      {error ? (
        <FieldError id={`${name}-error`} text={error} />
      ) : (
        <p id={`${name}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function SwitchField({ name, label, hint, defaultChecked }: { name: string; label: string; hint: string; defaultChecked: boolean }) {
  return (
    // the label wraps the switch, so the words are part of the click target and name it for a screen reader
    <label className="flex cursor-pointer items-start gap-3">
      <Switch name={name} defaultChecked={defaultChecked} className="mt-0.5 data-checked:bg-emerald-700" />
      <span className="space-y-0.5">
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

function FieldError({ id, text }: { id: string; text: string }) {
  return (
    <p id={id} role="alert" className="text-xs text-red-600 dark:text-red-400">
      {text}
    </p>
  );
}

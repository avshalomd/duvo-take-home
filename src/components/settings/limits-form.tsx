"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { updateLimitsAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { WorkspaceLimits } from "@/contracts/usage";
import { FOCUS_ROW, InsetGroup, rowLine } from "./grouped";
import { Stepper } from "./stepper";
import { submitKeepingValues } from "./submit-keeping-values";

// The workspace's limits and guard switches, as rows with a stepper or a switch at the end. Submitted without React's
// form reset, so a refused value stays as typed next to its error; the form is keyed on the saved limits, so once a
// save lands its fields start from the saved values. Members see it read-only (the action refuses them anyway).
export function LimitsForm({ limits, canEdit }: { limits: WorkspaceLimits; canEdit: boolean }) {
  const [state, action, pending] = useActionState(updateLimitsAction, {});
  const submitted = useRef(false);
  const form = useRef<HTMLFormElement>(null);
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
      key={JSON.stringify(limits)}
      ref={form}
      onSubmit={(e) => {
        submitted.current = true;
        submitKeepingValues(e, action);
      }}
      className="space-y-8"
    >
      <fieldset disabled={!canEdit} className="space-y-8">
        <InsetGroup title="Each day" footer="When a limit is reached, new runs wait until the day starts over at midnight UTC.">
          <StepperRow
            name="dailyBudgetUsd"
            label="Spend per day"
            detail="In US dollars, for all runs together. Each run working holds back $1, so the day never goes over"
            prefix="$"
            step={1}
            min={0}
            max={1000}
            defaultValue={String(limits.dailyBudgetUsd)}
            error={errors?.dailyBudgetUsd?.[0]}
          />
          <StepperRow name="dailyRunLimit" label="Runs per day" step={1} min={1} max={1000} defaultValue={String(limits.dailyRunLimit)} error={errors?.dailyRunLimit?.[0]} />
          <StepperRow
            name="maxInFlight"
            label="Runs at the same time"
            detail="More wait for one to finish"
            step={1}
            min={1}
            max={10}
            defaultValue={String(limits.maxInFlight)}
            error={errors?.maxInFlight?.[0]}
          />
        </InsetGroup>

        <InsetGroup
          title="While a run works"
          footer="When the check finds a problem, the agent is told what failed and tries again, up to this many times."
        >
          <SwitchRow
            name="stepChecks"
            label="Check each step as it finishes"
            detail="A quick automatic check after every step, so a run that drifts off track is flagged early."
            defaultChecked={limits.stepChecks}
          />
          <SwitchRow
            name="strictConnections"
            label="Block servers the plan did not name"
            detail="When off, the run only notes it. When on, the agent is stopped from using them."
            defaultChecked={limits.strictConnections}
          />
          {/* the last row, so the group's footer reads as its explanation; 0 tries is the feature switched off */}
          <StepperRow
            name="autoHealAttempts"
            label="Let the agent fix its own result"
            detail="Tries per run"
            zeroLabel="Off"
            step={1}
            min={0}
            max={5}
            defaultValue={String(limits.autoHealAttempts)}
            error={errors?.autoHealAttempts?.[0]}
          />
        </InsetGroup>

        <InsetGroup
          title="Blocked websites"
          footer={
            errors?.deniedDomains ? (
              <p id="deniedDomains-error" role="alert" className="text-crimson">
                {errors.deniedDomains[0]}
              </p>
            ) : (
              "One per line, like example.com. The agent will not open pages on these websites."
            )
          }
        >
          <li className={FOCUS_ROW}>
            <textarea
              id="deniedDomains"
              name="deniedDomains"
              aria-label="Blocked websites"
              rows={3}
              placeholder="None yet. For example: pastebin.com"
              defaultValue={limits.deniedDomains.join("\n")}
              aria-invalid={Boolean(errors?.deniedDomains)}
              aria-describedby={errors?.deniedDomains ? "deniedDomains-error" : undefined}
              className="block min-h-24 w-full resize-y bg-transparent px-4 py-3 outline-none placeholder:text-slate/70 aria-invalid:text-crimson"
            />
          </li>
        </InsetGroup>
      </fieldset>

      {state.error && (
        <p role="alert" className="px-4 text-[13px] text-crimson">
          {state.error}
        </p>
      )}
      {canEdit ? (
        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={pending} className="px-5">
            {pending && <LoaderCircle className="size-3.5 animate-spin" />}
            {pending ? "Saving..." : "Save limits"}
          </Button>
        </div>
      ) : (
        <p className="px-4 text-[13px] text-slate">Only an owner or an admin can change the limits.</p>
      )}
    </form>
  );
}

function StepperRow({
  name,
  label,
  detail,
  error,
  ...stepper
}: {
  name: string;
  label: string;
  detail?: string;
  error?: string;
  prefix?: string;
  zeroLabel?: string;
  step: number;
  min: number;
  max: number;
  defaultValue: string;
}) {
  return (
    <li className={rowLine()}>
      <div className="flex min-h-[56px] items-center gap-3 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <label htmlFor={name} className="block">
            {label}
          </label>
          {/* the error takes the place of the explanation, where the eye already is */}
          {error ? (
            <p id={`${name}-error`} role="alert" className="text-[13px] text-crimson">
              {error}
            </p>
          ) : (
            detail && <p className="text-[13px] tracking-[0.01em] text-slate">{detail}</p>
          )}
        </div>
        <Stepper id={name} name={name} label={label} invalid={Boolean(error)} describedBy={error ? `${name}-error` : undefined} {...stepper} />
      </div>
    </li>
  );
}

function SwitchRow({ name, label, detail, defaultChecked }: { name: string; label: string; detail: string; defaultChecked: boolean }) {
  return (
    <li className={rowLine()}>
      {/* the label wraps the switch, so the words are part of the click target and name it for a screen reader */}
      <label className="flex min-h-[56px] cursor-pointer items-center gap-3 px-4 py-2.5">
        <span className="min-w-0 flex-1">
          <span className="block">{label}</span>
          <span className="block text-[13px] tracking-[0.01em] text-slate">{detail}</span>
        </span>
        <Switch name={name} defaultChecked={defaultChecked} className="shrink-0 data-checked:bg-fern" />
      </label>
    </li>
  );
}

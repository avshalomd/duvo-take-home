"use client";

import { Minus, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A number that is usually nudged, not typed: minus, the value, plus, at the end of a row. The value stays a plain
 * input (typing works, and the form posts it under `name`); the buttons only move it by `step` within min and max.
 * The form's parse is still the judge of what is valid.
 */
export function Stepper({
  id,
  name,
  label,
  defaultValue,
  step,
  min,
  max,
  prefix,
  zeroLabel,
  invalid,
  describedBy,
}: {
  id: string;
  name: string;
  label: string; // for the buttons' names: "Lower Runs per day"
  defaultValue: string;
  step: number;
  min: number;
  max: number;
  prefix?: string;
  zeroLabel?: string; // what 0 means in words ("Off"), shown in place of the 0 while the field is not being typed in
  invalid?: boolean;
  describedBy?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [typing, setTyping] = useState(false);
  const current = Number(value);
  const saysZero = zeroLabel !== undefined && value.trim() !== "" && current === 0 && !typing;

  function nudge(by: number) {
    const base = Number.isFinite(current) && value.trim() !== "" ? current : min; // an empty or odd value starts from the floor
    const next = Math.min(max, Math.max(min, Math.round((base + by) * 100) / 100)); // cents at most: 4.99 + 1 is 5.99, not 5.990000001
    setValue(String(next));
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <StepButton label={`Lower: ${label}`} onClick={() => nudge(-step)} disabled={current <= min}>
        <Minus />
      </StepButton>
      {/* a fixed slot, the value centred in it: the three steppers of a group line up, and "$5" reads as one value */}
      <div className={cn("relative flex w-[4.75rem] items-baseline justify-center rounded-lg focus-within:bg-muted", invalid && "text-crimson")}>
        {prefix && <span aria-hidden className="text-slate">{prefix}</span>}
        <input
          id={id}
          name={name}
          type="number"
          inputMode="decimal"
          step="any" // the buttons keep to the step; a typed 2.50 is the parse's to judge
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          onFocus={() => setTyping(true)}
          onBlur={() => setTyping(false)}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          // a spinbutton, said out loud with its range, so a screen reader hears "Off" too, not "0"
          role="spinbutton"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={Number.isFinite(current) ? current : undefined}
          aria-valuetext={saysZero ? zeroLabel : undefined}
          // as wide as its digits (tabular figures are one ch each), so the prefix sits right against the number
          style={{ width: `${Math.min(Math.max(value.length, 1), 7) + 0.25}ch` }}
          className={cn(
            "[appearance:textfield] bg-transparent py-1 text-center font-medium tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            "disabled:cursor-not-allowed disabled:text-slate", // in a disabled fieldset (a member's Limits): read, not typed into
            saysZero && "opacity-0", // still there, still posted and focusable: only the word is drawn over it
          )}
        />
        {saysZero && (
          <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center font-medium text-slate">
            {zeroLabel}
          </span>
        )}
      </div>
      <StepButton label={`Raise: ${label}`} onClick={() => nudge(step)} disabled={current >= max}>
        <Plus />
      </StepButton>
    </div>
  );
}

function StepButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-8 place-items-center rounded-full bg-muted text-graphite transition-[transform,background-color] duration-100 outline-none hover:bg-graphite/10 focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.97] disabled:opacity-35 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

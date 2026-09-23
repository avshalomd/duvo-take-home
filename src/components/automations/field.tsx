import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

// One labelled field of the editor: a small label above, the control, then its hint or its error. The label names the
// control (by id); the hint and the error describe it.
export function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[13px] font-medium tracking-[0.01em] text-slate">
        {label}
      </Label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-[13px] leading-5 tracking-[0.01em] text-slate">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-hint`} role="alert" className="text-[13px] leading-5 text-crimson">
          {error}
        </p>
      )}
    </div>
  );
}

/** The props a control inside a Field needs so a screen reader reads its hint or error with it. */
export const describedBy = (id: string, error?: string) => ({ id, "aria-describedby": `${id}-hint`, "aria-invalid": Boolean(error) || undefined });

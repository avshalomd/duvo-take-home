import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

// One labelled field of the editor: the label names the control (by id), the hint and the error describe it.
export function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-hint`} role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

/** The props a control inside a Field needs so a screen reader reads its hint or error with it. */
export const describedBy = (id: string, error?: string) => ({ id, "aria-describedby": `${id}-hint`, "aria-invalid": Boolean(error) || undefined });

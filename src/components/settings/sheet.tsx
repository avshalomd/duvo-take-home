import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// A dialog as a paper sheet (docs/DESIGN-V2.md): radius 22, the floating shadow, no ring; it scrolls inside itself
// when a phone is shorter than the form. Passed to DialogContent, whose own padding and gap are replaced.
export const SHEET = "gap-0 overflow-y-auto rounded-[22px] bg-paper p-0 shadow-float ring-0 max-h-[calc(100dvh-2rem)] sm:max-w-[440px]";
export const SHEET_TITLE = "text-[20px] leading-tight font-semibold tracking-[-0.01em]";
export const SHEET_DESCRIPTION = "text-[13px] tracking-[0.01em] text-slate";

/** The sheet's closing row: the error, if any, then Cancel and the primary action at the end. */
export function SheetActions({ error, children }: { error?: string; children: ReactNode }) {
  return (
    <div className="space-y-3 px-6 pt-2 pb-6">
      {error && (
        <p role="alert" className="text-[13px] text-crimson">
          {error}
        </p>
      )}
      <div className={cn("flex justify-end gap-2")}>{children}</div>
    </div>
  );
}

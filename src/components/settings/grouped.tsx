import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Settings as grouped inset lists (docs/DESIGN-V2.md, like iOS Settings): a sentence-case title above a rounded group,
 * rows separated by hairlines that start where the text starts, and a short plain footer under the group when it
 * explains something. "paper" groups sit on the mist of a page; "mist" groups sit inside a paper sheet (a dialog).
 */
export function InsetGroup({
  title,
  footer,
  surface = "paper",
  className,
  children,
  ...list
}: {
  title?: string;
  footer?: ReactNode;
  surface?: "paper" | "mist";
} & ComponentProps<"ul">) {
  return (
    <section className="space-y-1.5">
      {title && <h2 className="px-4 text-[13px] font-medium tracking-[0.01em] text-slate">{title}</h2>}
      <ul
        className={cn(
          "overflow-hidden rounded-[16px]",
          surface === "paper" ? "bg-paper shadow-tile" : "bg-mist", // inside a sheet, the group is a recess, not a second card
          className,
        )}
        {...list}
      >
        {children}
      </ul>
      {footer && <div className="px-4 text-[13px] leading-snug tracking-[0.01em] text-slate">{footer}</div>}
    </section>
  );
}

/**
 * The hairline above every row but the first. It starts where the row's text starts - after the leading glyph when
 * there is one - as iOS draws it, so the glyphs read as a column and the text as a list.
 */
export function rowLine(leading: "glyph" | "text" = "text"): string {
  return cn(
    "relative not-first:before:absolute not-first:before:top-0 not-first:before:right-0 not-first:before:h-px not-first:before:bg-hairline",
    leading === "glyph" ? "not-first:before:left-[58px]" : "not-first:before:left-4",
  );
}

/**
 * A row whose field has no border of its own shows focus on the row: an inset ring (and, in a sheet, a paper fill).
 * The first and last rows take the group's 16 px corners, so the ring follows the rounded group instead of being
 * clipped into square corners by it (Q146).
 */
export const FOCUS_ROW = "focus-within:shadow-[inset_0_0_0_2px_var(--ring)] first:rounded-t-[16px] last:rounded-b-[16px]";

/** The 30 px rounded tile at the start of a row: a status or an action, drawn in one colour on its own wash. */
export function RowGlyph({ className, children, label }: { className?: string; children: ReactNode; label?: string }) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("grid size-[30px] shrink-0 place-items-center rounded-[9px] [&_svg]:size-4", className)}
    >
      {children}
    </span>
  );
}

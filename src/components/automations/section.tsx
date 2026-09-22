import type { ReactNode } from "react";

// One panel section: a small caps heading and its body. The headings are the panel's reading order.
export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t px-4 py-3 first:border-t-0">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

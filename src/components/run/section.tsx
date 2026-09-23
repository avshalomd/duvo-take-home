import type { ReactNode } from "react";

// One section of the Details panel: a plain heading and its body. The headings are the panel's reading order.
export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-hairline px-6 py-4 first:border-t-0">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[14px] text-slate">{children}</p>;
}

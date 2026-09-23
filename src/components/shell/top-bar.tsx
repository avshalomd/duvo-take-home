"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/auth/brand-mark";
import { UserMenu } from "@/components/auth/user-menu";
import { cn } from "@/lib/utils";

const PAGES = [
  { href: "/", label: "Home" },
  { href: "/automations", label: "Automations" },
  { href: "/settings", label: "Settings" },
];

// The id of the empty spot at the start of the bar where Home puts its "Runs" button on a phone: the bar belongs
// to every page, the runs belong to Home, so Home fills the spot (a portal) instead of the bar reading runs.
export const TOP_BAR_SLOT = "top-bar-slot";

// The three pages, and who is signed in to which workspace (UserMenu, from the auth package). Glass: the page
// scrolls under it, blurred, and the glass fades out at its lower edge instead of ending on a 1 px line.
export function TopBar({ userName, workspaceName }: { userName: string; workspaceName: string }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <header data-testid="app-header" className="sticky top-0 z-30">
      {/* the first thing the keyboard reaches on Home: past the bar and the rail, straight to the open run (Q70) */}
      {path === "/" && (
        <a
          href="#run"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-paper focus:px-4 focus:py-2 focus:text-sm focus:shadow-float focus:ring-[3px] focus:ring-ring/50"
        >
          Skip to the run
        </a>
      )}
      {/* the glass reaches 16 px below the bar and is masked away there: the soft edge where content meets it */}
      <div
        aria-hidden
        className="glass pointer-events-none absolute inset-x-0 top-0 -bottom-4 [mask-image:linear-gradient(to_bottom,black_calc(100%-16px),transparent)]"
      />
      <div className="relative flex h-14 items-center gap-2 px-3 min-[900px]:gap-5 min-[900px]:px-5">
        <div id={TOP_BAR_SLOT} className="contents min-[900px]:hidden" />
        {/* The product's mark, Handover, the same tile as on the sign-in page, without its word: a word beside the
            pages read as one more page (Q113). The name is the link's label instead. */}
        <Link
          href="/"
          aria-label="Handover home"
          className="shrink-0 rounded-[10px] transition-transform duration-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.97] [&_.display]:hidden"
        >
          <BrandMark />
        </Link>
        <nav aria-label="Pages" className="flex shrink-0 items-center gap-0.5">
          {PAGES.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              aria-current={active(p.href) ? "page" : undefined}
              className={cn(
                // active:scale: the same small give under a press as every other control (Q143)
                "rounded-full px-3 py-1.5 text-[14px] text-slate transition-[color,transform] duration-100 hover:text-graphite active:scale-[0.97] max-sm:px-2.5",
                "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                active(p.href) && "bg-paper font-medium text-graphite shadow-tile",
              )}
            >
              {p.label}
            </Link>
          ))}
        </nav>
        <div className="flex min-w-0 flex-1 items-center justify-end">
          <UserMenu userName={userName} workspaceName={workspaceName} />
        </div>
      </div>
    </header>
  );
}

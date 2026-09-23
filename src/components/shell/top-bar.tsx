"use client";

import { Workflow } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

// The three pages, and who is signed in to which workspace (UserMenu, from the auth package).
export function TopBar({ userName, workspaceName }: { userName: string; workspaceName: string }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <header data-testid="app-header" className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      {/* the first thing the keyboard reaches on Home: past the bar and the rail, straight to the open run (Q70) */}
      {path === "/" && (
        <a
          href="#run"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:border focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-[3px] focus:ring-ring/50"
        >
          Skip to the run
        </a>
      )}
      {/* h-14 is fixed: Home's rail is sticky just under it and sized to the rest of the screen */}
      <div className="flex h-14 w-full items-center gap-2 px-3 min-[900px]:gap-6 min-[900px]:px-5">
        <div id={TOP_BAR_SLOT} className="contents min-[900px]:hidden" />
        <Link href="/" className="flex shrink-0 items-center gap-2 rounded-md text-sm font-semibold tracking-tight focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
          <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-700 text-white" aria-hidden>
            <Workflow className="size-4" />
          </span>
          {/* the product name repeats the Automations page's name, so a phone keeps the mark and drops the word */}
          <span className="max-sm:sr-only">Automations</span>
        </Link>
        {/* the page links never shrink: on a phone the user menu gives way and truncates instead */}
        <nav aria-label="Pages" className="flex shrink-0 items-center gap-0.5">
          {PAGES.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              aria-current={active(p.href) ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-sm:px-2",
                "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                active(p.href) && "bg-muted font-medium text-foreground",
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

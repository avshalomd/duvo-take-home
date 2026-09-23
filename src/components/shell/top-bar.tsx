"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "@/components/auth/user-menu";
import { cn } from "@/lib/utils";

const PAGES = [
  { href: "/", label: "Home" },
  { href: "/automations", label: "Automations" },
  { href: "/settings", label: "Settings" },
];

// The three pages, and who is signed in to which workspace. The home package restyles it; the auth package adds
// the workspace switcher and sign-out.
export function TopBar({ userName, workspaceName }: { userName: string; workspaceName: string }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <header data-testid="app-header" className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[100rem] items-center gap-4 px-4 py-2.5">
        <span className="text-sm font-semibold tracking-tight">Automations</span>
        <nav aria-label="Pages" className="flex gap-1">
          {PAGES.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              aria-current={active(p.href) ? "page" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground",
                active(p.href) && "bg-muted font-medium text-foreground",
              )}
            >
              {p.label}
            </Link>
          ))}
        </nav>
        <UserMenu userName={userName} workspaceName={workspaceName} />
      </div>
    </header>
  );
}

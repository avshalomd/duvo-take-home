"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/connections", label: "Connections" },
  { href: "/settings/limits", label: "Limits" },
  { href: "/settings/members", label: "Members" },
];

// A client component only for usePathname: the layout stays on the server, and the tab you are on is underlined.
export function SettingsTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Settings" className="flex gap-1 border-b">
      {TABS.map((t) => {
        const active = path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              active ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

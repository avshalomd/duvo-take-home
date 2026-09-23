"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/connections", label: "Connections" },
  { href: "/settings/limits", label: "Limits" },
  { href: "/settings/members", label: "Members" },
];

// A segmented control: the three pages as segments on one track, the current one a paper pill that slides to the
// next with a spring. Links, not tabs: each segment is a page with its own address.
export function SettingsTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Settings" className="flex w-full rounded-full bg-graphite/[0.06] p-1 sm:w-fit">
      {TABS.map((t) => {
        const active = path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex-1 rounded-full px-5 py-1.5 text-center text-sm font-medium transition-[color,transform] duration-100 active:scale-[0.97] sm:flex-none",
              active ? "text-graphite" : "text-slate hover:text-graphite",
            )}
          >
            {/* the pill is shared between the segments (layoutId), so it moves rather than blinks on navigation */}
            {/* in dark mode paper is barely lighter than the track, so the pill is a light veil there instead */}
            {active && <motion.span layoutId="settings-segment" className="absolute inset-0 rounded-full bg-paper shadow-tile dark:bg-white/12" />}
            <span className="relative">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

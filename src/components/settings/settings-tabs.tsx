"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { tabShown, type PickedTab } from "./tab-choice";

const TABS = [
  { href: "/settings/connections", label: "Connections" },
  { href: "/settings/limits", label: "Limits" },
  { href: "/settings/members", label: "Members" },
];

// A segmented control: the three pages as segments on one track, the current one a paper pill that slides to the
// next with a spring. Links, not tabs: each segment is a page with its own address.
export function SettingsTabs() {
  const path = usePathname();
  const [picked, setPicked] = useState<PickedTab | null>(null);
  const shown = tabShown(path, picked); // the clicked tab at once; the page follows when it is ready
  return (
    <nav aria-label="Settings" className="flex w-full rounded-full bg-graphite/[0.06] p-1 sm:w-fit">
      {TABS.map((t) => {
        const active = shown.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            onClick={() => setPicked({ from: path, href: t.href })}
            // the page on screen, which is the old one until the new one arrives
            aria-current={path.startsWith(t.href) ? "page" : undefined}
            className={cn(
              "relative flex-1 rounded-full px-5 py-1.5 text-center text-sm font-medium transition-[color,transform] duration-100 active:scale-[0.97] sm:flex-none",
              // slate on the grey track measured 4.44:1, just under AA's 4.5: a fifth of graphite in it gives 5.5:1
              active ? "text-graphite" : "text-[color-mix(in_oklab,var(--slate),var(--graphite)_20%)] hover:text-graphite",
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

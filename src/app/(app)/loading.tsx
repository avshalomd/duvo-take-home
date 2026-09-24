"use client";

import { usePathname } from "next/navigation";
import { RailFallback, SheetSkeleton } from "@/components/run/panel-skeleton";
import { SettingsFrame } from "@/components/settings/settings-frame";
import { SettingsSkeleton } from "@/components/settings/settings-skeleton";
import AutomationLoading from "./automations/[id]/loading";
import GalleryLoading from "./automations/loading";
import NewAutomationLoading from "./automations/new/loading";
import { skeletonFor } from "./skeleton-for";

// The app's loading boundary, under the top bar: it is what makes a click on Home from another page change the screen
// at once (a dynamic page is prefetched only as far as its first loading boundary, and Home has none of its own, so
// that a run opened inside it is a transition, see (home)/page.tsx). It also stands in for another page's own
// boundary until that one is prefetched, so it draws the shape of the page being opened, read from the address:
// a client component, because on a navigation usePathname() is already the new address.
// No page below it calls notFound(): this boundary streams a 200 first (CLAUDE.md, "Patterns that bit").
export default function Loading() {
  const kind = skeletonFor(usePathname());
  if (kind === "home")
    return (
      <div className="flex w-full flex-1" aria-busy="true" aria-label="Loading">
        <RailFallback />
        <main className="min-w-0 flex-1 px-3 pt-3 pb-6 min-[900px]:px-8 min-[900px]:pt-6">
          <SheetSkeleton />
        </main>
      </div>
    );
  if (kind === "gallery") return <GalleryLoading />;
  if (kind === "new-automation") return <NewAutomationLoading />;
  if (kind === "automation") return <AutomationLoading />;
  if (kind === "settings")
    return (
      <SettingsFrame>
        <SettingsSkeleton />
      </SettingsFrame>
    );
  return null;
}

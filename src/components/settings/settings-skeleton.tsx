import { Skeleton } from "@/components/ui/skeleton";

// A Settings tab's groups, as the grouped lists every tab is made of (a title over a rounded group of rows), for the
// app's loading boundary to draw inside the Settings frame when Settings is opened from another page. Settings has
// no loading.tsx of its own: between tabs the pill moves at the click and the page follows (tab-choice.ts).
export function SettingsSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading">
      {[3, 2].map((rows, g) => (
        <div key={g} className="space-y-1.5">
          <Skeleton className="mx-4 h-3.5 w-40 rounded-full bg-paper/70" />
          <div className="divide-y divide-hairline overflow-hidden rounded-[16px] bg-paper/70">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex min-h-[52px] items-center gap-3 px-4 py-2.5">
                <Skeleton className="size-7 rounded-[8px]" />
                <Skeleton className="h-4 w-1/2 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

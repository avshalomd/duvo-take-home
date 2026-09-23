import { PanelSkeleton } from "@/components/run/panel-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

// The page reads the database before it renders; this is what the user sees while it does. It copies the real
// page's frame - the rail on a desk, the box and the run in the main column - so nothing moves when it arrives (Q66).
export default function Loading() {
  return (
    <div className="flex w-full flex-1">
      <div className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-72 shrink-0 flex-col gap-2 border-r bg-background p-3 min-[900px]:flex">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="mt-2 h-3 w-16" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
      <div className="mx-auto w-full max-w-4xl min-w-0 space-y-4 px-3 py-4 min-[900px]:px-6 min-[900px]:py-6">
        <Skeleton className="h-32 rounded-xl" />
        <PanelSkeleton />
      </div>
    </div>
  );
}

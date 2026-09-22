import { PanelSkeleton } from "@/components/automations/panel-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

// The page reads the database before it renders; this is what the user sees while it does. It copies the real
// page's grid - one column under 900px with the panel first - so nothing moves when the content arrives (Q66).
export default function Loading() {
  return (
    <div className="mx-auto grid w-full max-w-[100rem] flex-1 grid-cols-1 gap-4 px-4 py-4 min-[900px]:grid-cols-[21rem_minmax(0,1fr)] min-[900px]:gap-5">
      <div className="min-w-0 space-y-4">
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <div className="order-first min-w-0 min-[900px]:order-none">
        <PanelSkeleton />
      </div>
    </div>
  );
}

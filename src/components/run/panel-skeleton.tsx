import { Skeleton } from "@/components/ui/skeleton";

// The shape of the run panel, for the moment between picking a run and having it: the column keeps its width and
// roughly its height, so the page does not collapse and jump while the next run is read (Q66).
export function PanelSkeleton() {
  return (
    <div data-testid="panel-skeleton" className="space-y-4 rounded-xl border bg-background p-4">
      <div className="space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-40" />
      </div>
      <Skeleton className="h-1.5 w-full rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-5/6" />
      </div>
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

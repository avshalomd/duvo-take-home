import { Skeleton } from "@/components/ui/skeleton";

// What Home shows while it reads the database: the shapes of the real page - the rail's rows, the sheet's title,
// thread and tiles - so nothing moves when the content arrives (Q66).

export function SheetSkeleton() {
  return (
    <div data-testid="panel-skeleton" className="mx-auto max-w-[52rem] space-y-7 rounded-[22px] bg-paper px-6 pt-9 pb-10 shadow-sheet min-[900px]:px-12">
      <div className="space-y-3">
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="h-9 w-4/5 rounded-[12px]" />
        <Skeleton className="h-4 w-40 rounded-full" />
      </div>
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="h-4 w-2/3 rounded-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-24 rounded-[16px]" />
        <Skeleton className="h-24 rounded-[16px]" />
      </div>
    </div>
  );
}

export function RailFallback() {
  return (
    <div className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-72 shrink-0 flex-col gap-2 bg-mist-deep px-3 pt-3 min-[900px]:flex">
      <Skeleton className="h-9 w-full rounded-full" />
      <Skeleton className="h-8 w-full rounded-full" />
      <Skeleton className="mt-3 ml-3 h-3 w-12 rounded-full" />
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-7 w-full rounded-full" />
      ))}
    </div>
  );
}

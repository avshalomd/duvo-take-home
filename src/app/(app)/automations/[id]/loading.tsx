import { Skeleton } from "@/components/ui/skeleton";

// Laid out like the automation's page: the same width and columns, the document's sheet with Try it beside it, so
// nothing jumps when the page arrives. Without this file the gallery's loading state (tiles) flashed here first.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8 sm:px-6 sm:py-10" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-5 w-32 rounded-full bg-paper/70" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="space-y-5 rounded-[22px] bg-paper/70 p-6 sm:p-10">
          <Skeleton className="h-11 w-72 max-w-full rounded-[12px]" />
          <Skeleton className="h-5 w-40 rounded-full" />
          <Skeleton className="h-5 w-64 max-w-full rounded-full" />
          <Skeleton className="mt-8 h-32 rounded-[16px]" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-6 w-20 rounded-full bg-paper/70" />
          <Skeleton className="h-40 rounded-[16px] bg-paper/70" />
        </div>
      </div>
    </main>
  );
}

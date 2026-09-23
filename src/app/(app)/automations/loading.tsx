import { Skeleton } from "@/components/ui/skeleton";

// Shaped like the gallery (a title over tiles), so nothing jumps when the page arrives; without this file the Home
// page's skeleton would flash on every visit here.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 py-8 sm:px-6 sm:py-12" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <Skeleton className="h-11 w-64 rounded-[12px] bg-paper/70" />
        <Skeleton className="h-5 w-80 max-w-full rounded-full bg-paper/70" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Skeleton className="h-32 rounded-[16px] bg-paper/70" />
        <Skeleton className="h-32 rounded-[16px] bg-paper/70" />
        <Skeleton className="h-32 rounded-[16px] bg-paper/70" />
      </div>
    </div>
  );
}

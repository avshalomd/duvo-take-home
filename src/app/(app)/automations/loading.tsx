import { Skeleton } from "@/components/ui/skeleton";

// The automations pages are shaped like a header over cards; without this file the Home page's skeleton (the runs
// grid) would flash on every visit here.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}

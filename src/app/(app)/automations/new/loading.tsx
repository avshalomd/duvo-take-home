import { Skeleton } from "@/components/ui/skeleton";

// Laid out like the page it stands in for, the run picker or the drafting sheet: a narrow column with a title over
// one sheet. Without this file the gallery's loading state (tiles, a wider column) flashed here first.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-8 sm:px-6 sm:py-12" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-5 w-32 rounded-full bg-paper/70" />
      <div className="space-y-3">
        <Skeleton className="h-11 w-80 max-w-full rounded-[12px] bg-paper/70" />
        <Skeleton className="h-5 w-96 max-w-full rounded-full bg-paper/70" />
      </div>
      <Skeleton className="h-64 rounded-[22px] bg-paper/70" />
    </main>
  );
}

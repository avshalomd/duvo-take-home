import { Skeleton } from "@/components/ui/skeleton";

// The page reads the database before it renders; this is what the user sees while it does.
export default function Loading() {
  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <div className="space-y-6">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
      <Skeleton className="h-[32rem] rounded-xl" />
    </div>
  );
}

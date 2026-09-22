import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// One colour rule for the whole app: emerald = it worked, red = it did not, amber = still going.
const tone: Record<string, string> = {
  succeeded: "border-emerald-600/30 bg-emerald-600/10 text-emerald-700",
  pass: "border-emerald-600/30 bg-emerald-600/10 text-emerald-700",
  pass_with_notes: "border-amber-600/30 bg-amber-600/10 text-amber-700",
  running: "border-amber-600/30 bg-amber-600/10 text-amber-700",
  evaluating: "border-amber-600/30 bg-amber-600/10 text-amber-700",
  queued: "border-zinc-400/30 bg-zinc-400/10 text-zinc-600",
  failed: "border-red-600/30 bg-red-600/10 text-red-700",
  fail: "border-red-600/30 bg-red-600/10 text-red-700",
  unknown: "border-zinc-400/30 bg-zinc-400/10 text-zinc-600",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium", tone[status] ?? tone.unknown, className)}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

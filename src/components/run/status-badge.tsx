import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { statusLabel } from "./outcome";

// One colour rule for the whole app: emerald = it worked, red = it did not, amber = still going.
// The text tones are the 800 weights: at 10px on a tinted pill the 700s do not clear the contrast bar.
const tone: Record<string, string> = {
  succeeded: "border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300",
  pass: "border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300",
  pass_with_notes: "border-amber-600/30 bg-amber-600/10 text-amber-800 dark:text-amber-300",
  running: "border-amber-600/30 bg-amber-600/10 text-amber-800 dark:text-amber-300",
  evaluating: "border-amber-600/30 bg-amber-600/10 text-amber-800 dark:text-amber-300",
  queued: "border-zinc-400/30 bg-zinc-400/10 text-zinc-700 dark:text-zinc-300",
  failed: "border-red-600/30 bg-red-600/10 text-red-800 dark:text-red-300",
  fail: "border-red-600/30 bg-red-600/10 text-red-800 dark:text-red-300",
  unknown: "border-zinc-400/30 bg-zinc-400/10 text-zinc-700 dark:text-zinc-300",
  cancelled: "border-zinc-400/30 bg-zinc-400/10 text-zinc-700 dark:text-zinc-300",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium", tone[status] ?? tone.unknown, className)}>
      {statusLabel(status)}
    </Badge>
  );
}

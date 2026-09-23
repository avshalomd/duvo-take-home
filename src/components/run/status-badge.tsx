import { cn } from "@/lib/utils";
import { statusLabel } from "./outcome";

// The status and verdict enums as small badges, for Details only. Drawn from the palette's tokens, which change
// with the theme, so each one reads in dark mode as well as light (Q104).
const tone: Record<string, string> = {
  succeeded: "bg-fern-wash text-fern",
  pass: "bg-fern-wash text-fern",
  pass_with_notes: "bg-saffron-wash text-[color-mix(in_oklab,var(--saffron),var(--graphite)_40%)]",
  running: "bg-saffron-wash text-[color-mix(in_oklab,var(--saffron),var(--graphite)_40%)]",
  evaluating: "bg-saffron-wash text-[color-mix(in_oklab,var(--saffron),var(--graphite)_40%)]",
  failed: "bg-crimson-wash text-crimson",
  fail: "bg-crimson-wash text-crimson",
  queued: "bg-mist text-slate",
  unknown: "bg-mist text-slate",
  cancelled: "bg-mist text-slate",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-medium", tone[status] ?? tone.unknown, className)}>
      {statusLabel(status)}
    </span>
  );
}

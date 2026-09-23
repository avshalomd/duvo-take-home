import type { AutomationStatus } from "@/contracts/automation";
import { cn } from "@/lib/utils";

// The status in the user's words: "draft" means it still needs a person to check an example, "active" that it can be called.
const LOOK: Record<AutomationStatus, { label: string; className: string }> = {
  active: { label: "Ready", className: "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300" },
  draft: { label: "Draft", className: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300" },
  disabled: { label: "Off", className: "bg-muted text-muted-foreground ring-foreground/10" },
};

export function AutomationStatusBadge({ status, className }: { status: AutomationStatus; className?: string }) {
  const look = LOOK[status];
  return (
    <span data-testid="automation-status" className={cn("inline-flex h-5 items-center rounded-full px-2 text-xs font-medium ring-1 ring-inset", look.className, className)}>
      {look.label}
    </span>
  );
}

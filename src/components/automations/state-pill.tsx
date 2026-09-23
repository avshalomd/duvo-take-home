import type { AutomationStatus } from "@/contracts/automation";
import { cn } from "@/lib/utils";

// The state in the user's words. Ready is fern (done, usable); Draft is quiet ink (it waits for a person, not for the
// agent, so it is not saffron); Off is only an outline.
const LOOK: Record<AutomationStatus, { label: string; pill: string; dot: string }> = {
  active: { label: "Ready", pill: "bg-fern-wash text-fern", dot: "bg-fern" },
  draft: { label: "Draft", pill: "bg-muted text-graphite", dot: "border-[1.5px] border-graphite/60" },
  disabled: { label: "Off", pill: "text-slate ring-1 ring-inset ring-hairline", dot: "bg-slate/50" },
};

export function StatePill({ status, className }: { status: AutomationStatus; className?: string }) {
  const look = LOOK[status];
  return (
    <span data-testid="automation-status" className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium", look.pill, className)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", look.dot)} />
      {look.label}
    </span>
  );
}

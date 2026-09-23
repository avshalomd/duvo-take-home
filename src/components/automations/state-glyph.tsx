import { CircleCheck, CircleDashed, CircleMinus } from "lucide-react";
import type { AutomationStatus } from "@/contracts/automation";
import { cn } from "@/lib/utils";

// The state as a glyph and a word, not a badge on the card (Q139). Ready is fern, the palette's "done, usable"; Draft
// is a dashed ring in ink, because it waits for a person, not for the agent; Off is slate.
const LOOK: Record<AutomationStatus, { label: string; Icon: typeof CircleCheck; className: string }> = {
  active: { label: "Ready", Icon: CircleCheck, className: "text-fern" },
  draft: { label: "Draft", Icon: CircleDashed, className: "text-graphite" },
  disabled: { label: "Off", Icon: CircleMinus, className: "text-slate" },
};

export function StateGlyph({ status, className }: { status: AutomationStatus; className?: string }) {
  const { label, Icon, className: tone } = LOOK[status];
  return (
    <span data-testid="automation-status" className={cn("inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium", tone, className)}>
      <Icon aria-hidden className="size-4" strokeWidth={2.25} />
      {label}
    </span>
  );
}

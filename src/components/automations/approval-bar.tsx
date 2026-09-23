"use client";

import { LoaderCircle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useActionState } from "react";
import { approveAction, type ActionState } from "@/app/(app)/automations/actions";
import { Button } from "@/components/ui/button";
import { approvalLabel, type ApprovalProgress } from "@/lib/automations/approval";
import { cn } from "@/lib/utils";
import { SMALL, TILE } from "./surfaces";

const FILL = { right: "bg-fern", wrong: "bg-crimson", open: "bg-transparent" } as const;

type Props = {
  automationId: string;
  progress: ApprovalProgress;
  allowed: boolean; // the examples allow it (canApprove)
  reason: string | null;
  approver: boolean; // the viewer is an owner or an admin (Q178)
};

// Approval as a bar that fills as the examples are judged: one segment per example of this version, fern when it
// looks right, crimson when it does not. The Approve action sits on the bar; when it cannot be pressed the reason
// (from canApprove on the server) says what is missing. A member sees the bar and who approves, not a button (Q178).
export function ApprovalBar({ automationId, progress, allowed, reason, approver }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(approveAction, {});

  if (!approver)
    return (
      <div className={cn(TILE, "space-y-4 p-5")}>
        <Segments progress={progress} />
        <p data-testid="approve-reason" className={SMALL}>
          {allowed ? "An example looks right, so an owner or an admin can approve it now." : "An owner or an admin approves it once an example looks right."}
        </p>
      </div>
    );

  return (
    <form action={action} className={cn(TILE, "space-y-4 p-5")}>
      <input type="hidden" name="id" value={automationId} />
      <Segments progress={progress} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!allowed || pending} className="h-10 px-5 text-[15px]">
          {pending && <LoaderCircle className="size-4 animate-spin" />}
          Approve and save
        </Button>
        <p data-testid="approve-reason" aria-live="polite" className={cn(SMALL, state.error && "text-crimson")}>
          {state.error ?? (allowed ? "Once approved, it can be called from Home." : reason)}
        </p>
      </div>
    </form>
  );
}

function Segments({ progress }: { progress: ApprovalProgress }) {
  const reduce = useReducedMotion();
  if (progress.total === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-[15px] font-medium text-graphite">{approvalLabel(progress)}</p>
      <div className="flex gap-1" aria-hidden>
        {progress.segments.map((s, i) => (
          <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-hairline">
            {/* a judgment fills its segment with a spring; initial={false}: nothing animates on the page's first paint */}
            <motion.span
              className={cn("block h-full origin-left rounded-full", FILL[s])}
              initial={false}
              animate={{ scaleX: s === "open" ? 0 : 1 }}
              transition={reduce ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }}
            />
          </span>
        ))}
      </div>
    </div>
  );
}

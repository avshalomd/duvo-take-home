"use client";

import { Check, ChevronDown, CircleHelp, Minus, RotateCcw, Scale, X } from "lucide-react";
import { useActionState } from "react";
import { reevaluateAction } from "@/app/(app)/actions";
import { cn } from "@/lib/utils";
import type { WhyLine } from "./why";

/**
 * Q208: when the checker could not be reached (the model was down), the result was never looked at, and the only way
 * to check it again was inside Details. The outcome line's neighbour says so in words and offers the check again.
 */
export function NotChecked({ runId }: { runId: string }) {
  const [state, action, checking] = useActionState(reevaluateAction, {});
  return (
    <form action={action} data-testid="not-checked" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] leading-5 text-slate">
      <input type="hidden" name="runId" value={runId} />
      <span>The result was not checked: the checker could not be reached.</span>
      <button
        type="submit"
        disabled={checking}
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium text-graphite underline-offset-2 transition-transform duration-100 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.97] disabled:opacity-60 max-[899px]:min-h-8"
      >
        <Scale aria-hidden className={cn("size-3.5", checking && "animate-pulse")} />
        {checking ? "Checking..." : "Check again"}
      </button>
      {state.error && (
        <span role="alert" className="basis-full text-crimson">
          {state.error}
        </span>
      )}
    </form>
  );
}

// "Why?" sits beside the outcome sentence, quiet, and opens the explanation under it: one plain line per tier.
export function WhyButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="why"
      // active:scale: the same small give under a press as every other control (Q143)
      className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[14px] text-slate transition-[color,transform] duration-100 hover:text-graphite focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.97] max-[899px]:min-h-8"
    >
      Why?
      <ChevronDown aria-hidden className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")} />
    </button>
  );
}

const icon: Record<WhyLine["tone"], React.ReactNode> = {
  ok: <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-fern" />,
  warn: <CircleHelp aria-hidden className="mt-0.5 size-4 shrink-0 text-saffron" />,
  bad: <X aria-hidden className="mt-0.5 size-4 shrink-0 text-crimson" />,
  idle: <Minus aria-hidden className="mt-0.5 size-4 shrink-0 text-slate" />,
  // an attempt to fix the result: work that went round again, in the live colour, never the failure red
  retry: <RotateCcw aria-hidden className="mt-0.5 size-4 shrink-0 text-saffron" />,
};

export function WhyList({ lines }: { lines: WhyLine[] }) {
  return (
    <ul id="why" data-testid="why" className="mt-3 max-w-[66ch] space-y-2 text-[14px] leading-5">
      {lines.map((line) => (
        <li key={line.tier + line.text} className="flex items-start gap-2.5">
          {icon[line.tone]}
          {/* the tier that settled the outcome reads in full colour; the ones that only passed it on are quieter */}
          <span className={line.decided ? "text-graphite" : "text-slate"}>
            {line.text}
            {line.decided && <span className="sr-only"> - this decided the outcome</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

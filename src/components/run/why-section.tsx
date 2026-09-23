import { Check, ChevronDown, CircleHelp, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WhyLine } from "./why";

// "Why?" sits beside the outcome sentence and opens the explanation under it: one plain line per evaluator tier.
export function WhyButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="why"
      className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium text-emerald-800 hover:bg-emerald-600/10 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none max-[899px]:min-h-8 dark:text-emerald-300"
    >
      Why?
      <ChevronDown className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")} aria-hidden />
    </button>
  );
}

const icon: Record<WhyLine["tone"], React.ReactNode> = {
  ok: <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />,
  warn: <CircleHelp className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />,
  bad: <X className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden />,
  idle: <Minus className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />,
};

export function WhyList({ lines }: { lines: WhyLine[] }) {
  return (
    <ul id="why" data-testid="why" className="space-y-1.5 border-b bg-muted/30 px-4 py-3 text-sm animate-in fade-in-0 slide-in-from-top-1 duration-200">
      {lines.map((line) => (
        <li key={line.tier + line.text} className="flex items-start gap-2">
          {icon[line.tone]}
          {/* the tier that settled the outcome reads a little stronger than the ones that only passed it on */}
          <span className={cn("leading-snug", line.decided ? "text-foreground" : "text-muted-foreground")}>
            {line.text}
            {line.decided && <span className="sr-only"> - this decided the outcome</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

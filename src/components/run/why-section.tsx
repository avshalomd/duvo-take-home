import { Check, ChevronDown, CircleHelp, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WhyLine } from "./why";

// "Why?" sits beside the outcome sentence, quiet, and opens the explanation under it: one plain line per tier.
export function WhyButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="why"
      className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[14px] text-slate transition-colors hover:text-graphite focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none max-[899px]:min-h-8"
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

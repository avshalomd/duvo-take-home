import { cn } from "@/lib/utils";

// One mark, one meaning, everywhere in the app (docs/DESIGN-V2.md colours). Shape carries meaning as well as colour,
// so the marks can be told apart without colour (Q105): a filled dot is a settled fact - done, working, went wrong -
// and a ring is "not a result": not checked, not started, or a result that did not pass.
export type Tone = "ok" | "idle" | "warn" | "bad" | "broken" | "busy";

const toneClass: Record<Tone, string> = {
  ok: "bg-fern",
  warn: "bg-saffron",
  busy: "bg-saffron animate-pulse", // the live mark breathes (opacity, not a spin); reduced motion stops it
  broken: "bg-crimson",
  bad: "border-[1.5px] border-crimson",
  idle: "border-[1.5px] border-slate",
};

export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn("inline-flex size-2 shrink-0 rounded-full", toneClass[tone], className)} />;
}

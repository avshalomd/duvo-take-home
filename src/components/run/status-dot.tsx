import { cn } from "@/lib/utils";

// One mark, one meaning, everywhere in the app (docs/DESIGN-V2.md colours, the same as the automations' DOT): fern
// done - a pass with notes is still done, as the thread says - saffron at work, crimson failed, slate not run. The
// words beside it (or read out for it) say which kind of done or failed.
export type Tone = "ok" | "idle" | "warn" | "bad" | "busy";

const toneClass: Record<Tone, string> = {
  ok: "bg-fern",
  warn: "bg-fern",
  busy: "bg-saffron animate-pulse", // the live mark breathes (opacity, not a spin); reduced motion stops it
  bad: "bg-crimson",
  idle: "bg-slate/60",
};

export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn("inline-flex size-2 shrink-0 rounded-full", toneClass[tone], className)} />;
}

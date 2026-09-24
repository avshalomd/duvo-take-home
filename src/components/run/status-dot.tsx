import { cn } from "@/lib/utils";

// One mark, one meaning, everywhere in the app (docs/DESIGN-V2.md colours, the same as the automations' DOT): fern
// done - a pass with notes is still done, as the thread says - saffron at work, crimson failed, slate not run. The
// words beside it (or read out for it) say which kind of done or failed. Two rings, never filled: "unchecked", a
// finished result nobody checked (qa-ux U7, the picker's hollow ring everywhere), and "asks", a run waiting on the
// person's answer - a dashed ring in ink, as a draft automation that waits for a person is drawn (qa-ai F3).
export type Tone = "ok" | "idle" | "warn" | "bad" | "busy" | "unchecked" | "asks";

const toneClass: Record<Tone, string> = {
  ok: "bg-fern",
  warn: "bg-fern",
  busy: "bg-saffron animate-pulse", // the live mark breathes (opacity, not a spin); reduced motion stops it
  bad: "bg-crimson",
  idle: "bg-slate/60",
  unchecked: "border-[1.5px] border-slate bg-transparent",
  asks: "border-[1.5px] border-dashed border-graphite bg-transparent",
};

export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn("inline-flex size-2 shrink-0 rounded-full", toneClass[tone], className)} />;
}

import type { Tone } from "@/components/run/status-dot";

// The small dot beside an outcome, in the palette's words: fern done, saffron at work, crimson failed, slate not run.
// It follows outcome()'s tone and agrees with the thread's colour (a pass with notes is still done). A plain module,
// not the thread's "use client" one, so Server Components can use it too.
export const DOT: Record<Tone, string> = {
  ok: "bg-fern",
  warn: "bg-fern",
  busy: "bg-saffron",
  bad: "bg-crimson",
  idle: "bg-slate/60",
  unchecked: "border-[1.5px] border-slate bg-transparent", // the same rings as StatusDot (qa-ux U7, qa-ai F3)
  asks: "border-[1.5px] border-dashed border-graphite bg-transparent",
};

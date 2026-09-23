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
};

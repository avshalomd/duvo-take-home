import { cn } from "@/lib/utils";

// One dot, one meaning, everywhere in the app: emerald worked, amber is working, red failed, zinc has not run.
export type Tone = "ok" | "idle" | "warn" | "bad" | "busy";

const toneClass: Record<Tone, string> = {
  ok: "bg-emerald-500",
  idle: "bg-zinc-400",
  warn: "bg-amber-500",
  bad: "bg-red-500",
  busy: "bg-amber-500",
};

export const statusTone: Record<string, Tone> = {
  succeeded: "ok",
  pass: "ok",
  pass_with_notes: "warn",
  running: "busy",
  evaluating: "busy",
  queued: "idle",
  failed: "bad",
  fail: "bad",
  unknown: "idle",
};

export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  return (
    <span className={cn("relative flex h-2 w-2 shrink-0", className)} aria-hidden>
      {/* only a live run pulses, so movement on the screen always means work in progress */}
      {tone === "busy" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-70" />
      )}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", toneClass[tone])} />
    </span>
  );
}

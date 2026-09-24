"use client";

import { Check, Minus, TriangleAlert } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The thread (docs/DESIGN-V2.md): the agent's work drawn as one line through its plan. The line fills as steps
 * finish, a bead marks the step being worked on, and the filled part takes the run's colour - saffron while the
 * agent works, fern when it is done, slate where it was stopped. A run that failed draws its finished steps done:
 * they did run, and red checks said "done" and "failed" at once; the failure is said once, in the outcome line.
 *
 * One component for every place the plan is shown: the run (size "full", with notes), an automation's example
 * cards (size "mini") and the sign-in page's illustration. It knows nothing about runs: callers map their data in.
 */
export type ThreadStep = {
  key: string | number;
  title: ReactNode;
  // unmarked: the run finished well but the agent never ticked the step (qa-ai F8) - settled, quiet, not "not started"
  status: "pending" | "running" | "done" | "skipped" | "unmarked";
  note?: ReactNode; // what happened on this step, in the agent's words (full size only)
  flag?: ReactNode; // a doubt about a finished step, in plain words: drawn amber beside the note
};
export type ThreadTone = "live" | "done" | "failed" | "stopped";

const DONE = { fill: "bg-fern", node: "bg-fern border-fern text-white", text: "text-fern" };
const TONE: Record<ThreadTone, { fill: string; node: string; text: string }> = {
  live: { fill: "bg-saffron", node: "bg-saffron border-saffron text-white", text: "text-saffron" },
  done: DONE,
  failed: DONE, // the steps that ran are done; only the outcome is red
  stopped: { fill: "bg-slate", node: "bg-slate border-slate text-white", text: "text-slate" },
};

// Critically damped: the line arrives without overshooting, and a new target mid-flight redirects it smoothly.
const SPRING = { type: "spring" as const, bounce: 0, duration: 0.6 };

export function Thread({
  steps,
  tone,
  size = "full",
  className,
  label = "Plan",
  planOnly = false,
}: {
  steps: ThreadStep[];
  tone: ThreadTone;
  size?: "full" | "mini";
  className?: string;
  label?: string;
  // the steps of a plan nobody has run (the gallery): a screen reader hears the steps, with no state for each (UX QA U13)
  planOnly?: boolean;
}) {
  const list = useRef<HTMLOListElement>(null);
  // The steps already done when the thread first appeared: they are drawn done, with no pop. Only a step that
  // finishes while the person watches pops, so a page load has no entrance animation (and the server's markup and
  // the browser's first render agree, whatever the reduced-motion setting).
  const [doneAtFirstPaint] = useState(
    () => new Set(steps.filter((s) => s.status === "done").map((s) => s.key)),
  );
  const nodes = useRef<(HTMLSpanElement | null)[]>([]);
  const [track, setTrack] = useState({ top: 0, height: 0, fill: 0 });

  // The fill ends at the centre of the furthest step reached (the running one, else the last finished or skipped).
  const reached = lastReached(steps);
  const mini = size === "mini";

  // Measure after layout: the line runs from the first node's centre to the last one's, and the fill to the
  // reached node's. Re-measured when the plan's shape changes or the column is resized (a note wraps differently).
  // The shape, not the array: a live run hands in a new array every second with the same steps in it.
  const shape = planShape(steps);
  const count = steps.length;
  useLayoutEffect(() => {
    const measure = () => {
      const host = list.current;
      const first = nodes.current[0];
      const last = nodes.current[count - 1];
      if (!host || !first || !last) return;
      const base = host.getBoundingClientRect().top;
      const centre = (el: HTMLElement) => el.getBoundingClientRect().top + el.offsetHeight / 2 - base;
      const top = centre(first);
      const height = Math.max(0, centre(last) - top);
      const target = reached >= 0 ? nodes.current[reached] : null;
      const measured = { top, height, fill: target ? Math.max(0, centre(target) - top) : 0 };
      setTrack((current) => nextTrack(current, measured)); // the same track back: React skips the render
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (list.current) ro.observe(list.current);
    return () => ro.disconnect();
  }, [shape, count, reached]);

  const t = TONE[tone];
  const gutter = mini ? "w-5" : "w-8";
  const nodeSize = mini ? "size-2.5" : "size-5";

  return (
    // "user": under reduced motion, motion skips transform animations (the fill and the pop jump to their end)
    <MotionConfig reducedMotion="user">
      <ol
        ref={list}
        aria-label={label}
        data-testid="thread"
        className={cn("relative", mini ? "space-y-1.5" : "space-y-4", className)}
      >
        {/* the track: a quiet hairline groove the whole length of the plan */}
        <span
          aria-hidden
          className={cn("absolute rounded-full bg-hairline", mini ? "left-[9px] w-0.5" : "left-[14px] w-1")}
          style={{ top: track.top, height: track.height }}
        />
        {/* the thread itself: grows from the top with a spring as steps finish */}
        <motion.span
          aria-hidden
          className={cn(
            "absolute origin-top rounded-full",
            t.fill,
            mini ? "left-[9px] w-0.5" : "left-[14px] w-1",
          )}
          style={{ top: track.top, height: track.height || 1 }}
          initial={false}
          animate={{ scaleY: track.height ? track.fill / track.height : 0 }}
          transition={SPRING}
        />
        {steps.map((step, i) => {
          const current = step.status === "running";
          return (
            <li key={step.key} className="relative flex gap-3" aria-current={current ? "step" : undefined}>
              {/* items-start: the node sits beside the title's first line, not in the middle of the title and its note */}
              <span
                className={cn(
                  "flex shrink-0 items-start justify-center",
                  gutter,
                  mini ? "pt-[5px]" : "pt-[2px]",
                )}
              >
                <span
                  ref={(el) => {
                    nodes.current[i] = el;
                  }}
                  className="relative flex shrink-0 items-center justify-center"
                >
                  <Node
                    status={step.status}
                    tone={t}
                    size={nodeSize}
                    mini={mini}
                    pop={!doneAtFirstPaint.has(step.key)}
                    said={!planOnly}
                  />
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    mini ? "text-[13px] leading-5" : "text-[16px] leading-6",
                    step.status === "pending" && "text-slate",
                    step.status === "skipped" && "text-slate line-through decoration-hairline",
                    current && "font-semibold",
                    step.status === "done" && "font-medium",
                  )}
                >
                  {step.title}
                </p>
                {!mini && step.note && (
                  <p className="mt-0.5 max-w-[62ch] text-[13px] leading-5 tracking-[0.01em] text-slate">
                    {step.note}
                  </p>
                )}
                {!mini && step.flag && (
                  <p className="mt-1 flex max-w-[62ch] items-start gap-1.5 text-[13px] leading-5 text-[color-mix(in_oklab,var(--saffron),var(--graphite)_35%)]">
                    <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-saffron" />
                    <span>{step.flag}</span>
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </MotionConfig>
  );
}

function Node({
  status,
  tone,
  size,
  mini,
  pop,
  said,
}: {
  status: ThreadStep["status"];
  tone: (typeof TONE)[ThreadTone];
  size: string;
  mini: boolean;
  pop: boolean; // the step finished while the person was watching
  said: boolean; // the state is read out after the node
}) {
  if (status === "running") {
    return (
      <span
        className={cn(
          "relative flex items-center justify-center rounded-full border-2 border-saffron bg-paper",
          size,
        )}
      >
        {/* the bead breathes slowly (opacity and scale, not a spin): work is happening here, calmly. CSS, so
            reduced motion simply switches it off, with nothing for the server and the browser to disagree on */}
        <span className="absolute inset-1 animate-[thread-breathe_1.6s_ease-in-out_infinite] rounded-full bg-saffron motion-reduce:animate-none" />
        {said && <span className="sr-only">In progress</span>}
      </span>
    );
  }
  if (status === "done") {
    return (
      <motion.span
        // a finished step's node fills with a small pop, the only bounce in the thread: it answers a change
        initial={pop ? { scale: 0.6 } : false}
        animate={{ scale: 1 }}
        transition={{ type: "spring", bounce: 0.35, duration: 0.4 }}
        className={cn("flex items-center justify-center rounded-full border-2", tone.node, size)}
      >
        {!mini && <Check aria-hidden strokeWidth={3.5} className="size-3" />}
        {said && <span className="sr-only">Done</span>}
      </motion.span>
    );
  }
  if (status === "unmarked") {
    // a ring in the done colour, faint and hollow: the work is over, but nobody ticked this step
    return (
      <span className={cn("flex items-center justify-center rounded-full border-2 border-fern/45 bg-paper", size)}>
        {!mini && <span aria-hidden className="size-1.5 rounded-full bg-fern/45" />}
        <span className="sr-only">Not marked</span>
      </span>
    );
  }
  if (status === "skipped") {
    return (
      <span
        className={cn(
          "flex items-center justify-center rounded-full border-2 border-dashed border-slate/60 bg-paper text-slate",
          size,
        )}
      >
        {!mini && <Minus aria-hidden strokeWidth={3} className="size-3" />}
        {said && <span className="sr-only">Skipped</span>}
      </span>
    );
  }
  return (
    <span className={cn("rounded-full border-2 border-hairline bg-paper", size)}>
      {said && <span className="sr-only">Not started</span>}
    </span>
  );
}

/** The index the fill reaches: the running step, else the last finished, skipped or unmarked one; -1 before any. */
export function lastReached(steps: Pick<ThreadStep, "status">[]): number {
  const running = steps.findIndex((s) => s.status === "running");
  if (running >= 0) return running;
  let last = -1;
  steps.forEach((s, i) => {
    if (s.status === "done" || s.status === "skipped" || s.status === "unmarked") last = i;
  });
  return last;
}

/** The plan as its steps' keys and statuses: what moves the line. Two arrays with the same steps read the same. */
export function planShape(steps: Pick<ThreadStep, "key" | "status">[]): string {
  return steps.map((s) => `${s.key}:${s.status}`).join("|");
}

type Track = { top: number; height: number; fill: number };

/** The track to keep after a measure: the current one when nothing moved, so setting it causes no render. */
export function nextTrack(current: Track, measured: Track): Track {
  const same = current.top === measured.top && current.height === measured.height && current.fill === measured.fill;
  return same ? current : measured;
}

/** The run-level colour of the thread from the run's status and outcome, for callers that hold a run. */
export function threadTone(status: string, outcome?: string | null): ThreadTone {
  if (status === "cancelled") return "stopped";
  if (status === "failed" || outcome === "fail") return "failed";
  if (status === "succeeded") return "done";
  return "live";
}

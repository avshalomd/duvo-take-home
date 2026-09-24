"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const BRIEF = "[data-brief]";

/**
 * An open run's title: the brief, two lines at most so the thread below stays in view (Q137). A brief cut to two lines
 * can be read in full where it is (UX QA U20, the owner's call): the title becomes a button that opens it in place and
 * closes it again. A title that fits stays plain text, since a button that does nothing is a trap.
 *
 * The height moves, from two lines to the whole brief and back, as a CSS transition: it can be reversed mid-way, and
 * with reduced motion it simply changes. The ellipsis comes back once the close has finished, so no line is cut early.
 */
export function BriefTitle({ title, brief }: { title: string; brief: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [size, setSize] = useState<{ two: number; full: number } | null>(null); // null until measured: the server's plain title
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(true);
  const cut = size !== null && size.full > size.two + 1;

  // measured in the browser, again whenever the sheet's width changes: whether the brief is cut depends on both
  useLayoutEffect(() => {
    const el = heading.current;
    if (!el) return;
    const measure = () => {
      const text = el.querySelector<HTMLElement>(BRIEF);
      if (!text) return;
      const two = Math.round(parseFloat(getComputedStyle(text).lineHeight) * 2);
      setSize({ two, full: text.scrollHeight }); // scrollHeight counts the lines the clamp hides
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [title]);

  function toggle() {
    if (open) {
      setOpen(false);
      // no transition to wait for: the ellipsis comes back at once
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setClamped(true);
    } else {
      setClamped(false);
      setOpen(true);
    }
  }

  const text = (
    <span data-brief className={cn("block", clamped && "line-clamp-2")}>
      {title}
    </span>
  );

  return (
    // the whole brief is the tooltip too, since the title may be the automation's name for it
    <h1 ref={heading} id="run-title" className="run-title mt-3 break-words" title={brief}>
      {size && cut ? (
        <button type="button" aria-expanded={open} onClick={toggle} className="block w-full cursor-pointer rounded-[10px] text-left transition-colors hover:text-graphite/85 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
          <span
            className="block overflow-hidden transition-[height] duration-300 ease-(--ease-out-soft) motion-reduce:transition-none"
            style={{ height: open ? size.full : size.two }}
            onTransitionEnd={(e) => {
              if (e.propertyName === "height" && !open) setClamped(true); // closed, not reopened mid-way
            }}
          >
            {text}
          </span>
        </button>
      ) : (
        text
      )}
    </h1>
  );
}

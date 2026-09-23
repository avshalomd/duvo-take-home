"use client";

import { useEffect, useState } from "react";
import { relativeTime } from "./relative-time";

// Relative time is computed from the reader's clock, which is not the server's: the first render is the server's
// string (suppressed so a one-minute difference is not a hydration error) and an effect keeps it fresh.
export function TimeAgo({ iso, className }: { iso: string; className?: string }) {
  const [text, setText] = useState(() => relativeTime(iso));

  // the clock is an external system: the effect only subscribes to it, the first value came from useState
  useEffect(() => {
    const timer = setInterval(() => setText(relativeTime(iso)), 30_000);
    return () => clearInterval(timer);
  }, [iso]);

  return (
    <span className={className} suppressHydrationWarning title={iso}>
      {text}
    </span>
  );
}

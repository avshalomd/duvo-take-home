"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "./format";

// A live run needs a clock that moves: the seconds ticking are what tell the user the page is not stuck.
export function Elapsed({ since }: { since: string }) {
  const [ms, setMs] = useState(() => Date.now() - new Date(since).getTime());

  useEffect(() => {
    const timer = setInterval(() => setMs(Date.now() - new Date(since).getTime()), 1000);
    return () => clearInterval(timer);
  }, [since]);

  return (
    <span className="tabular-nums" suppressHydrationWarning>
      {formatDuration(Math.max(0, ms))} so far
    </span>
  );
}

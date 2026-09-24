"use client";

import { useSyncExternalStore } from "react";
import { fullDate, relativeTime } from "./relative-time";

// The reader's clock ticks every 30 s; that is the only thing this subscribes to.
function everyHalfMinute(onChange: () => void) {
  const timer = setInterval(onChange, 30_000);
  return () => clearInterval(timer);
}
const readerZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// Relative time is the reader's: their clock and their calendar day, which the server does not know. So the server
// renders it for UTC and the browser swaps in its own right after hydration (useSyncExternalStore: no mismatch
// warning, and no stale server text kept on screen). The tooltip is the moment itself, in words.
export function TimeAgo({ iso, className, testId }: { iso: string; className?: string; testId?: string }) {
  const text = useSyncExternalStore(
    everyHalfMinute,
    () => relativeTime(iso, new Date(), readerZone()),
    () => relativeTime(iso, new Date(), "UTC"),
  );
  const title = useSyncExternalStore(
    everyHalfMinute,
    () => fullDate(iso, readerZone()),
    () => fullDate(iso, "UTC"),
  );
  return (
    // suppressHydrationWarning: the server's minute may already be over by the time the browser hydrates
    <time dateTime={iso} data-testid={testId} className={className} title={title} suppressHydrationWarning>
      {text}
    </time>
  );
}

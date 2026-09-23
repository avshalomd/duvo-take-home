"use client";

import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

// Times in the timeline are the reader's local time, not the server's UTC. useSyncExternalStore is the one hook
// that can render a different value on the server (UTC) and on the client (local) without a hydration mismatch.
export function LocalTime({ iso, className }: { iso: string; className?: string }) {
  const text = useSyncExternalStore(
    noSubscribe,
    () => new Date(iso).toLocaleTimeString(),
    () => `${new Date(iso).toISOString().slice(11, 19)} UTC`,
  );
  return (
    <time dateTime={iso} className={className} title={new Date(iso).toISOString()}>
      {text}
    </time>
  );
}

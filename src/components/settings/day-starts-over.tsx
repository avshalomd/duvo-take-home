"use client";

import { useSyncExternalStore } from "react";
import { startsOverAt } from "./usage-format";

const noSubscribe = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// "at 02:00 your time" (UX QA U28). The reader's zone is the browser's: useSyncExternalStore renders UTC on the server
// and the reader's own time after hydration, without a mismatch (as LocalTime and the runs rail do).
export function DayStartsOver({ resetsAt }: { resetsAt: string }) {
  const zone = useSyncExternalStore(noSubscribe, browserZone, () => null);
  return <time dateTime={resetsAt}>{startsOverAt(resetsAt, zone)}</time>;
}

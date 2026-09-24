"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { shouldPoll } from "./poll";

const EVERY_MS = 5000; // a run takes minutes: a few seconds late is soon enough to say Run may go again

/**
 * While the composer holds a refusal that a run settling may lift (UX QA U3: the runs in flight fill the workspace's
 * limit), watch the workspace's runs and ask the server for a fresh page once fewer are working than the page was
 * drawn with: Home then reads the limits again. `working` is the server's count from that same read, so a run that
 * settles before the first look is still seen settling; null switches the watch off. The open run's own poll refreshes
 * the page when it settles (Q79); this also covers the runs not open. One small GET every five seconds, only while
 * the refusal stands and the tab is in front.
 */
export function useRefreshWhenARunSettles(working: number | null) {
  const router = useRouter();
  useEffect(() => {
    if (working === null) return;
    let stopped = false;
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/runs", { cache: "no-store" });
        if (!res.ok || stopped) return;
        const { runs } = (await res.json()) as { runs: { status: string }[] };
        // the fresh page carries the refusal as it is now, or none; a new count starts this watch again
        if (runs.filter((r) => shouldPoll(r.status)).length < working) router.refresh();
      } catch {
        // a dropped look is not worth a word: the next tick tries again
      }
    }, EVERY_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [working, router]);
}

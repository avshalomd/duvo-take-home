"use client";

import { useEffect, useState } from "react";
import { parseRunPayload, shouldPoll } from "./poll";
import type { RunView } from "./types";

const INTERVAL_MS = 2000;

// The panel is server-rendered first; this only keeps a live run moving. No websocket: one small GET every two
// seconds is enough for a run that lasts a minute, and it is one thing to explain instead of three.
export function useRunPoll(initial: RunView): RunView {
  const [polled, setPolled] = useState<RunView | null>(null);
  // the id check is the reset: when the server renders another run, the previous run's polled view is ignored
  const view = polled && polled.run.id === initial.run.id ? polled : initial;
  const { id, status } = view.run;

  useEffect(() => {
    if (!shouldPoll(status)) return;
    let cancelled = false;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${id}`, { cache: "no-store" });
        if (!res.ok) return; // the route is not there yet, or the run is gone: keep what we have
        const next = parseRunPayload(await res.json());
        if (next && !cancelled) setPolled(next);
      } catch {
        // a dropped poll is not something the user needs to see: the next tick retries
      }
    }, INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, status]);

  return view;
}

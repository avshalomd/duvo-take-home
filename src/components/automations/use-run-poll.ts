"use client";

import { useEffect, useState } from "react";
import { parseRunPayload, shouldPoll } from "./poll";
import type { RunView } from "./types";

const INTERVAL_MS = 2000;

// The panel is server-rendered first; this only keeps a live run moving. No websocket: one small GET every two
// seconds is enough for a run that lasts a minute, and it is one thing to explain instead of three.
export function useRunPoll(initial: RunView): RunView {
  const [view, setView] = useState(initial);

  // a new run selected on the server replaces the polled state, otherwise the panel would show the old run
  useEffect(() => setView(initial), [initial]);

  useEffect(() => {
    if (!shouldPoll(view.run.status)) return;
    let cancelled = false;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${view.run.id}`, { cache: "no-store" });
        if (!res.ok) return; // the route is not there yet (or the run is gone): keep what we have
        const next = parseRunPayload(await res.json());
        if (next && !cancelled) setView(next);
      } catch {
        // a dropped poll is not an error the user needs: the next tick retries
      }
    }, INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [view.run.id, view.run.status]);

  return view;
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { chooseView, isTerminal, parseRunPayload, shouldPoll } from "./poll";
import type { RunView } from "./types";

const INTERVAL_MS = 2000;

// The panel is server-rendered first; this only keeps a live run moving. No websocket: one small GET every two
// seconds is enough for a run that lasts a minute, and it is one thing to explain instead of three.
export function useRunPoll(initial: RunView): RunView {
  const [polled, setPolled] = useState<RunView | null>(null);
  // chooseView decides which picture is the later one: another run, or a newer server render (Re-evaluate), drops the poll
  const view = chooseView(initial, polled);
  const { id, status } = view.run;

  // The runs list beside the panel is a server render, so it would say "Working on it" until the next reload.
  // One refresh at the moment the run settles brings the row - and the header's live count - up to date (Q79).
  const seenLive = useRef<string | null>(isTerminal(initial.run.status) ? null : initial.run.id);
  const router = useRouter();
  useEffect(() => {
    if (seenLive.current !== id || !isTerminal(status)) return;
    seenLive.current = null; // once per run: a run that was already finished when the page rendered needs nothing
    router.refresh();
  }, [id, status, router]);

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

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { chooseView, isTerminal, mergeStreamMessage, parseRunPayload, parseStreamMessage, shouldPoll } from "./poll";
import type { RunView } from "./types";

const INTERVAL_MS = 2000;

// The panel is server-rendered first; this keeps a live run moving. It listens to the run's event stream
// (server-sent events, one message a second) and falls back to one small GET every two seconds when the stream
// is not there (a 404 before the route exists) or breaks. Polling is the floor, the stream is the improvement.
export function useRunPoll(initial: RunView): RunView {
  const [polled, setPolled] = useState<RunView | null>(null);
  // chooseView decides which picture is the later one: another run, or a newer server render (Re-evaluate), drops the poll
  const view = chooseView(initial, polled);
  const { id, status } = view.run;
  const live = shouldPoll(status);

  // the stream's messages carry no files and no verdict: each one is folded into the latest full view
  const latest = useRef(view);
  useEffect(() => {
    latest.current = view;
  });

  // The rail beside the panel is a server render, so it would say "Working on it" until the next reload.
  // One refresh at the moment the run settles brings the row up to date (Q79).
  const seenLive = useRef<string | null>(isTerminal(initial.run.status) ? null : initial.run.id);
  const router = useRouter();
  useEffect(() => {
    if (seenLive.current !== id || !isTerminal(status)) return;
    seenLive.current = null; // once per run: a run that was already finished when the page rendered needs nothing
    router.refresh();
  }, [id, status, router]);

  useEffect(() => {
    if (!live) return;
    let closed = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let source: EventSource | undefined;

    async function fetchFull() {
      try {
        const res = await fetch(`/api/runs/${id}`, { cache: "no-store" });
        if (!res.ok) return; // the run is gone, or the session expired: keep what we have
        const next = parseRunPayload(await res.json());
        if (next) setPolled(next); // chooseView ignores it if the panel has moved to another run since
      } catch {
        // a dropped poll is not something the user needs to see: the next tick retries
      }
    }
    function startPolling() {
      if (closed || timer !== undefined) return;
      timer = setInterval(fetchFull, INTERVAL_MS);
    }

    if (typeof EventSource === "undefined") startPolling();
    else {
      source = new EventSource(`/api/runs/${id}/events`);
      source.onmessage = (m) => {
        const msg = parseStreamMessage(safeJson(m.data));
        if (!msg || msg.run.id !== id) return;
        setPolled(mergeStreamMessage(latest.current, msg));
        if (msg.done) {
          source?.close();
          void fetchFull(); // the files and the verdict exist now, and only the full payload carries them
        }
      };
      // one way down, never back: a stream that failed once is not retried while this run is open
      source.onerror = () => {
        source?.close();
        startPolling();
      };
    }

    return () => {
      closed = true;
      source?.close();
      if (timer !== undefined) clearInterval(timer);
    };
  }, [id, live]);

  return view;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

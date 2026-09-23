"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Verdict } from "@/contracts/eval";
import { FileMeta, Run, RunStatus } from "@/contracts/run";

// Only the part of GET /api/runs/<id> an example card shows, checked at the boundary: the route is another package's.
const Payload = z.object({
  run: z.object({ status: RunStatus, outcome: Run.shape.outcome }),
  files: z.array(FileMeta),
  verdict: Verdict.nullable().default(null),
});

export type LiveRun = { status: RunStatus; outcome: Run["outcome"]; files: FileMeta[]; verdict: Verdict | null };

const LIVE: string[] = ["queued", "running", "evaluating"];
const INTERVAL_MS = 2500;

/**
 * An example's run, kept moving while it works: one small GET every few seconds, stopped once it has finished. When
 * it finishes the page is refreshed once, because what the server shows around it - the approval, the last run - reads it.
 */
export function useLiveRun(runId: string, initial: LiveRun): LiveRun {
  const [latest, setLatest] = useState(initial);
  const router = useRouter();
  const live = LIVE.includes(latest.status);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
        if (!res.ok) return; // keep the last good picture; the next tick tries again
        const parsed = Payload.safeParse(await res.json());
        if (!parsed.success) return;
        const next: LiveRun = { status: parsed.data.run.status, outcome: parsed.data.run.outcome ?? null, files: parsed.data.files, verdict: parsed.data.verdict };
        setLatest(next);
        if (!LIVE.includes(next.status)) router.refresh();
      } catch {
        // a dropped poll is not worth showing: the next tick retries
      }
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [live, runId, router]);

  return latest;
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Verdict } from "@/contracts/eval";
import { FileMeta, Plan, Run, RunStatus } from "@/contracts/run";

// Only the part of GET /api/runs/<id> an example card shows, checked at the boundary: the route is another package's.
const Payload = z.object({
  run: z.object({ status: RunStatus, outcome: Run.shape.outcome }),
  files: z.array(FileMeta),
  verdict: Verdict.nullable().default(null),
  state: z.object({ plan: Plan.nullable() }),
});

export type LiveRun = { status: RunStatus; outcome: Run["outcome"]; files: FileMeta[]; verdict: Verdict | null; plan: Plan | null };

const LIVE: string[] = ["queued", "running", "evaluating"];
const INTERVAL_MS = 2500;

/**
 * An example's run, kept moving while it works: one small GET every few seconds, stopped once it has finished. When
 * it finishes the page is refreshed once, because what the server shows around it - the approval bar - reads it.
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
        const d = parsed.data;
        const next: LiveRun = { status: d.run.status, outcome: d.run.outcome ?? null, files: d.files, verdict: d.verdict, plan: d.state.plan };
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

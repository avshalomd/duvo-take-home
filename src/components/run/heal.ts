import type { RunEvent, RunState } from "@/contracts/run";

// Auto-heal as the glance view tells it (his call, 2026-09-23): a result the check failed is fixed inside the same
// run, at most the workspace's number of times, and the run says pass or fail only when the tries are over.

/** One attempt to fix the result. stopped: the engine recorded it, then did not make it (the last fix made no
 *  progress, Q148) - the run went straight to its final verdict. */
export type Heal = NonNullable<RunState["heals"]>[number] & { stopped?: boolean };

const LIVE = ["queued", "running", "evaluating"];

/**
 * The run's attempts, the last one marked stopped when a finished run never worked on it. The events tell: every
 * attempt the agent made ends in a "finished" event, and a stopped one is followed by none.
 */
export function healsOf(heals: RunState["heals"], events: RunEvent[], runStatus: string): Heal[] {
  const list: Heal[] = (heals ?? []).map((h) => ({ ...h, stopped: false }));
  // only a run that ended on a verdict: a live one is still working on it, a cancelled one was stopped by a person
  if (list.length === 0 || LIVE.includes(runStatus) || runStatus === "cancelled") return list;
  const lastHeal = events.findLastIndex((e) => e.kind === "heal");
  const workedOn = events.slice(lastHeal + 1).some((e) => e.kind === "finished");
  if (!workedOn) list[list.length - 1].stopped = true;
  return list;
}

/** The fixes the agent actually made. */
export function fixesRun(heals: Heal[]): number {
  return heals.filter((h) => !h.stopped).length;
}

const WORDS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

/** "first", "second", ...: a workspace allows a handful of attempts, so the words run out long before they are needed. */
export function ordinal(n: number): string {
  return WORDS[n - 1] ?? `${n}th`;
}

/** The plain sentence for an attempt the engine did not make. */
export function stoppedLine(heal: Heal): string {
  return heal.attempt > 1
    ? `Stopped trying: the ${ordinal(heal.attempt - 1)} fix did not get the result any closer to passing`
    : "Stopped before trying a fix";
}

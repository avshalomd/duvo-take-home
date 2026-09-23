import type { RunEvent, RunState } from "@/contracts/run";

// Auto-heal as the glance view tells it (his call, 2026-09-23): a result the check failed is fixed inside the same
// run, at most the workspace's number of times, and the run says pass or fail only when the tries are over.

/** One attempt to fix the result. stopped: the engine recorded it, then did not make it because the last fix made
 *  no progress (Q148) - the run went straight to its final verdict; stoppedBecause is the engine's own sentence. */
export type Heal = NonNullable<RunState["heals"]>[number] & { stopped?: boolean; stoppedBecause?: string };

/**
 * The run's attempts, each marked stopped when its heal event carries the engine's reason to stop. RunState.heals has
 * the attempts; the reason is only on the event, so it is read from there, by attempt.
 */
export function healsOf(heals: RunState["heals"], events: RunEvent[]): Heal[] {
  const reasons = new Map<number, string>();
  for (const e of events) if (e.kind === "heal" && e.payload.stopped) reasons.set(e.payload.attempt, e.payload.stopped);
  return (heals ?? []).map((h) => {
    const because = reasons.get(h.attempt);
    return because ? { ...h, stopped: true, stoppedBecause: because } : { ...h, stopped: false };
  });
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

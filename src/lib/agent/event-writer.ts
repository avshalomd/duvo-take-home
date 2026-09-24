import type { RunEvent } from "@/contracts/run";

/**
 * One writer, in order: the agent's messages, the guards' decisions and the step checks all arrive from different
 * callbacks, and each event gets the next seq only when it is written.
 *
 * A failed write fails only its own caller (engine review #12). The chain used to be poisoned by one rejected
 * write - every later write rejected with the same error - so one transient database error failed the whole run.
 * An insert is tried twice; a seq is spent only on an event that was stored, so a lost event leaves no gap.
 */
export function createEventWriter(opts: {
  insert: (event: RunEvent) => Promise<void>;
  written: (event: RunEvent) => void; // what the run keeps in memory about each stored event; must not throw
}) {
  let seq = 1;
  let chain: Promise<void> = Promise.resolve();

  const insertTwice = async (event: RunEvent) => {
    try {
      await opts.insert(event);
    } catch {
      await opts.insert(event); // one retry covers a database blink; a second failure is the caller's
    }
  };

  const write = (events: Omit<RunEvent, "seq">[]): Promise<void> => {
    const done = chain.then(async () => {
      for (const raw of events) {
        const event = { ...raw, seq } as RunEvent;
        await insertTwice(event);
        seq += 1;
        opts.written(event);
      }
    });
    chain = done.catch(() => undefined); // the next write starts from a settled chain, whatever this one did
    return done;
  };

  /** Every write queued so far has settled. Never rejects: each failure went to its own caller. */
  const drained = () => chain;

  return { write, drained };
}

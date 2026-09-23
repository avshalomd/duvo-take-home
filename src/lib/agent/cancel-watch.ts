export type CancelWatch = {
  cancelled: () => boolean;
  whenCancelled: Promise<void>; // resolves when a request is seen; never rejects
  stop: () => void;
};

/**
 * Stop, beside the wall clock: every `everyMs` it asks whether the user pressed Stop, and on yes it aborts the same
 * AbortController the deadline uses, so the SDK sees one abort whatever caused it.
 */
export function watchCancel(opts: { isRequested: () => Promise<boolean>; controller: AbortController; everyMs: number }): CancelWatch {
  let cancelled = false;
  let asking = false; // a slow read must not stack a second one on top of it
  let resolve!: () => void;
  const whenCancelled = new Promise<void>((r) => (resolve = r));

  const timer = setInterval(async () => {
    if (asking || cancelled) return;
    asking = true;
    try {
      if (await opts.isRequested()) {
        cancelled = true;
        clearInterval(timer);
        opts.controller.abort();
        resolve();
      }
    } catch {
      // a failed read is not a request; the next poll asks again
    } finally {
      asking = false;
    }
  }, opts.everyMs);
  timer.unref?.(); // the poll must never hold the process open after the run has closed

  return { cancelled: () => cancelled, whenCancelled, stop: () => clearInterval(timer) };
}

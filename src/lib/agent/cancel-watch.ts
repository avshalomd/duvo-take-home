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
  throw new Error(`not implemented: watchCancel(${opts.everyMs})`);
}

/**
 * Remembers what `check` answered for `ms`, in this server instance's memory (Q177): /api/health?deep=1 is public and
 * its check is a paid model call, so a request inside the window gets the kept answer instead of a new call. A failed
 * answer is kept too (an outage must not become a call per request); a check that throws is not. Requests that arrive
 * while a check runs share it. `now` is a parameter so a test can move the clock.
 */
export function cacheFor<T>(ms: number, check: () => Promise<T>, now: () => number = Date.now): () => Promise<T> {
  let kept: { value: T; at: number } | null = null;
  let running: Promise<T> | null = null;

  return () => {
    if (kept && now() - kept.at < ms) return Promise.resolve(kept.value);
    running ??= check()
      .then((value) => {
        kept = { value, at: now() }; // the minute counts from the answer, not from the question
        return value;
      })
      .finally(() => {
        running = null;
      });
    return running;
  };
}

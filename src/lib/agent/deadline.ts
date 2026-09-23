/**
 * The run's wall clock. The SDK stops a run on turns and on budget, but a tool that hangs (a slow MCP server, a
 * fetch that never returns) spends neither, so without this a run stays "running" for ever. `query()` takes an
 * AbortController; we abort it on the deadline and remember that it was us, so the run can say "timed out".
 */
export function startDeadline(ms: number) {
  const controller = new AbortController();
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, ms);
  timer.unref?.(); // the timer must never hold the process open after the run has closed
  return {
    controller,
    expired: () => expired,
    clear: () => clearTimeout(timer),
  };
}

/**
 * The work's own result, or the fallback's once `ms` have passed, whichever comes first. The work is not stopped - a
 * model call cannot be - only no longer waited for, so what follows the agent can never outlive the function.
 */
export function within<T>(work: Promise<T>, ms: number, fallback: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback()), ms);
    timer.unref?.(); // the timer must never hold the process open after the run has closed
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

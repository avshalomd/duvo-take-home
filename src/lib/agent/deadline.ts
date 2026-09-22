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

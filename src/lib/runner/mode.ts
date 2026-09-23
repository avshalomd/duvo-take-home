/** Read at call time, not at import: the worker sets RUNNER=queue for itself before it starts anything. */
export const runnerMode = (): "inline" | "queue" => (process.env.RUNNER === "queue" ? "queue" : "inline");

/**
 * Can a schedule fire in this deployment? Something must call tickSchedules: the worker (RUNNER=queue) every 30 s,
 * or Vercel cron through /api/cron/tick, which only answers when CRON_SECRET is set. Inline with no secret, nothing
 * would ever fire one, and the automations page says so instead of promising a run that never comes (QA Q84).
 */
export const schedulerRunning = (): boolean => runnerMode() === "queue" || Boolean(process.env.CRON_SECRET);

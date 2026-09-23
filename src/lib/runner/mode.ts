/** Read at call time, not at import: the worker sets RUNNER=queue for itself before it starts anything. */
export const runnerMode = (): "inline" | "queue" => {
  throw new Error("not implemented: runnerMode");
};

/** Can a schedule fire in this deployment? Something must call tickSchedules: the worker, or Vercel cron. */
export const schedulerRunning = (): boolean => {
  throw new Error("not implemented: schedulerRunning");
};

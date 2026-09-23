// How a run gets executed. RUNNER=inline (default): after() in the request that started it, as v1.
// RUNNER=queue: a jobs row that the worker (npm run worker) claims; no function time limit, and schedules fire there.
export type EnqueueRun = (runId: string) => Promise<void>;
/** Sets cancel_requested_at; the loop sees it within 2 s, aborts the agent and closes the run as cancelled. */
export type CancelRun = (workspaceId: string, runId: string) => Promise<void>;
/** Starts the runs of every automation whose schedule is due, and moves each next_run_at on. Returns the run ids. */
export type TickSchedules = (now: Date) => Promise<string[]>;

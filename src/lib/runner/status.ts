import type { RunStatus } from "@/contracts/run";

/** A run in one of these is still moving: the loop (or the queue) owns it and will close it. */
export const IN_FLIGHT: readonly RunStatus[] = ["queued", "running", "evaluating"];
/** A run in one of these is closed for good: nothing writes to it again. */
export const FINISHED: readonly RunStatus[] = ["succeeded", "failed", "cancelled"];

export const isFinished = (status: string): boolean => (FINISHED as readonly string[]).includes(status);
export const isInFlight = (status: string): boolean => (IN_FLIGHT as readonly string[]).includes(status);

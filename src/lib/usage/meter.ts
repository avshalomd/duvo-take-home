import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { costOfCall, type ModelUsage } from "./model-prices";

/**
 * The model spend of one piece of work, such as Check again (QA F18). The work calls the judge, maybe a reviewer and
 * the step checks, several layers down; each model template reports its own tokens here (extract() and decide()),
 * and the meter around the work adds them up. An AsyncLocalStorage rather than a parameter through every layer: the
 * evaluator's functions stay as they are, and two pieces of work running at once each see only their own meter.
 */
const current = new AsyncLocalStorage<{ usd: number }>();

/** Called by the model templates after each call. Outside metered work (a live run's own checks) it does nothing. */
export function reportModelUsage(usage: ModelUsage): void {
  const meter = current.getStore();
  if (meter) meter.usd += costOfCall(usage);
}

/** Runs the work, then hands `record` what its model calls cost - also when the work failed, since those were paid. */
export async function metered<T>(work: () => Promise<T>, record: (costUsd: number) => Promise<void>): Promise<T> {
  const meter = { usd: 0 };
  try {
    return await current.run(meter, work);
  } finally {
    await record(meter.usd);
  }
}

import type { CheckStep } from "@/contracts/eval";

/** Jev's per-step check. The run loop calls it after a step is marked done; a failure is recorded as nothing. */
export const checkStep: CheckStep = async () => {
  throw new Error("not implemented: checkStep"); // STUB: the eval package
};

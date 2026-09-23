import "server-only";
import type { CancelRun } from "@/contracts/runner";

export const cancelRun: CancelRun = async () => {
  throw new Error("not implemented: cancelRun"); // STUB: the engine package
};

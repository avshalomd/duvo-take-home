/** The words a stopped run carries, in the UI and in the API. */
export const STOPPED_BY_YOU = "Stopped by you";

export type CancelDecision =
  | { ok: true; closeNow: boolean } // closeNow: nobody has picked the run up yet, so cancel closes it itself
  | { ok: false; reason: string };

/** Which statuses may be cancelled, and how. Pure, so the rule is readable and tested on its own. */
export function cancelDecision(status: string): CancelDecision {
  throw new Error(`not implemented: cancelDecision(${status})`);
}

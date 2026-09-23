/** The words a stopped run carries, in the UI and in the API. */
export const STOPPED_BY_YOU = "Stopped by you";

export type CancelDecision =
  | { ok: true; closeNow: boolean } // closeNow: nobody has picked the run up yet, so cancel closes it itself
  | { ok: false; reason: string };

/** Which statuses may be cancelled, and how. Pure, so the rule is readable and tested on its own. */
export function cancelDecision(status: string): CancelDecision {
  switch (status) {
    case "queued":
      return { ok: true, closeNow: true }; // no loop is watching yet, so a request would wait for ever
    case "running":
    case "evaluating":
      return { ok: true, closeNow: false }; // the loop sees cancel_requested_at within 2 s and closes the run itself
    case "cancelled":
      return { ok: false, reason: "This run was already stopped" };
    case "succeeded":
    case "failed":
      return { ok: false, reason: "This run has already finished" };
    default:
      return { ok: false, reason: `A run that is ${status} cannot be stopped` };
  }
}

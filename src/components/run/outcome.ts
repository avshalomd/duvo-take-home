import type { Tone } from "./status-dot";

// The one line the user reads first. Statuses and verdicts are the system's words; this is the user's. Every finished
// outcome is "Done" and a comma, or a sentence of its own, in one style (qa-ux U6).
// verdict is Run.outcome, which the contract marks optional: an absent field is "not checked", never a pass.
// stopping is Run.cancelRequested: Stop was pressed and the runner has not closed the run yet (it checks every 2 s).
//
// heal: auto-heal's attempts to fix a result the check failed (his call, 2026-09-23). attempts is the number of fixes;
// max, the workspace's limit, when the caller knows it (the run page does, the rail's run rows do not). The run
// says pass or fail only when the tries are over, so while it fixes it reads as progress: no red, no "did not pass".
export function outcome(
  runStatus: string,
  verdict: string | null | undefined,
  stopping?: boolean,
  heal?: { attempts: number; max?: number },
): { label: string; tone: Tone } {
  if (runStatus === "cancelled") return { label: "Stopped", tone: "idle" }; // Q114: not "by you" - another member may have pressed it
  // a broken run is a problem whatever the judge said; its words, not its colour, set it apart from a failed result
  if (runStatus === "failed") return { label: "Something went wrong", tone: "bad" };
  const live = runStatus === "queued" || runStatus === "running" || runStatus === "evaluating";
  const attempts = heal?.attempts ?? 0;
  if (live && stopping) return { label: "Stopping...", tone: "busy" };
  if (live && attempts > 0) {
    const which = heal?.max ? ` (attempt ${attempts} of ${heal.max})` : "";
    return { label: `Fixing what the check found${which}`, tone: "busy" };
  }
  if (runStatus === "queued") return { label: "Getting ready", tone: "idle" };
  if (runStatus === "running") return { label: "Working on it", tone: "busy" };
  if (runStatus === "evaluating") return { label: "Checking the result", tone: "busy" };

  switch (verdict) {
    case "pass":
      return { label: "Done, looks good", tone: "ok" }; // fixed or not: Why? says it took a fix
    case "pass_with_notes":
      return { label: "Done, with notes", tone: "warn" };
    case "fail":
      if (attempts > 0) return { label: `Did not pass after ${attempts} ${attempts === 1 ? "attempt" : "attempts"} to fix it`, tone: "bad" };
      return { label: "Done, but the result did not pass", tone: "bad" };
    // qa-ai F3 (the owner's call): the run truthfully said it cannot be done here, or asked for what only the person
    // knows. Neither is a failed result: calm words, no red.
    case "cannot_do":
      return { label: "Could not be done", tone: "idle" };
    case "needs_answer":
      return { label: "Needs your answer", tone: "asks" };
    default:
      // unknown (the checker was down) or no verdict at all (never checked): one word and one hollow mark for both,
      // on the rail, the run page and the picker alike (qa-ux U7). Never a claim that it was checked.
      return { label: "Done, not checked", tone: "unchecked" };
  }
}

/**
 * The sentence beside Check again on the glance view, for a finished run nobody checked (qa-ux U7): the checker was
 * down (Q208), or the run was never checked at all. Null when there is nothing to check again.
 */
export function notCheckedLine(runStatus: string, verdict: string | null | undefined): string | null {
  if (runStatus !== "succeeded") return null;
  if (verdict === "unknown") return "The result was not checked: the checker could not be reached.";
  return verdict ? null : "The result has not been checked.";
}

/** What to do next, beside an outcome that is not a result to judge (qa-ai F3). */
export function outcomeHint(runStatus: string, verdict: string | null | undefined): string | null {
  if (runStatus !== "succeeded") return null;
  if (verdict === "needs_answer") return "The question is in the report below. Answer it with Ask for a change, and the run goes on from there.";
  if (verdict === "cannot_do") return "The report below says why.";
  return null;
}

/** The status and verdict enums as words, for the badges in Details. */
export function statusLabel(status: string): string {
  if (status === "cancelled") return "stopped";
  return status.replace(/_/g, " ");
}

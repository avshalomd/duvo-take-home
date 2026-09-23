import type { Tone } from "./status-dot";

// The one line the user reads first. Statuses and verdicts are the system's words; this is the user's.
// verdict is Run.outcome, which the contract marks optional: an absent field is "not judged", never a pass
export function statusLabel(status: string): string {
  return status;
}

export function outcome(runStatus: string, verdict: string | null | undefined, stopping?: boolean): { label: string; tone: Tone } {
  void stopping;
  if (runStatus === "failed") return { label: "Something went wrong", tone: "bad" }; // a broken run is a problem whatever the judge said
  if (runStatus === "queued") return { label: "Getting ready", tone: "idle" };
  if (runStatus === "running") return { label: "Working on it", tone: "busy" };
  if (runStatus === "evaluating") return { label: "Checking the result", tone: "busy" };

  switch (verdict) {
    case "pass":
      return { label: "Done - looks good", tone: "ok" };
    case "pass_with_notes":
      return { label: "Done, with notes", tone: "warn" };
    case "fail":
      return { label: "Done, but the result did not pass", tone: "bad" };
    case "unknown":
      return { label: "Done - not checked", tone: "idle" }; // the judge was unavailable: never claim it was checked
    default:
      return { label: "Done", tone: "ok" };
  }
}

/** The run as far as the check needs it: why it exists and the automation version it was started at. */
export type AutomationRun = { purpose: string; automationVersion: number | null };
/** The automation as it is now, or null when it is gone. */
export type AutomationNow = { status: string; version: number } | null;

export const AUTOMATION_GONE = "The automation this run belongs to was deleted";
export const AUTOMATION_CHANGED = "The automation was changed after this run was queued; run it again once it is approved";
export const EXAMPLE_CHANGED = "The automation was changed after this example was started; run the example again";

/**
 * May a run of a saved automation start with the automation as it is now? null when it may; otherwise the reason in
 * plain words, which closes the run as failed before the agent starts (QA Q82). Without it, a command or schedule
 * run queued at approved version 1 would run - and be judged against - an unapproved edit saved in the meantime.
 */
export function automationRunRefusal(run: AutomationRun, automation: AutomationNow): string | null {
  if (!automation) return AUTOMATION_GONE;
  // An example runs a draft on purpose (that is how a draft gets approved), but only the version it was started for.
  if (run.purpose === "trial") return automation.version === run.automationVersion ? null : EXAMPLE_CHANGED;
  // A command or a schedule may only run what a person approved: active, and still the version the run was queued at.
  if (run.purpose === "automation" || run.purpose === "schedule") {
    return automation.status === "active" && automation.version === run.automationVersion ? null : AUTOMATION_CHANGED;
  }
  return null;
}

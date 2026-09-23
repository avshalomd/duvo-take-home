/** The run as far as the check needs it: why it exists and the automation version it was started at. */
export type AutomationRun = { purpose: string; automationVersion: number | null };
/** The automation as it is now, or null when it is gone. */
export type AutomationNow = { status: string; version: number } | null;

/**
 * May a run of a saved automation start with the automation as it is now? null when it may; otherwise the reason in
 * plain words, which closes the run as failed before the agent starts.
 */
export function automationRunRefusal(run: AutomationRun, automation: AutomationNow): string | null {
  throw new Error(`not implemented: automationRunRefusal(${run.purpose}, ${automation?.version})`);
}

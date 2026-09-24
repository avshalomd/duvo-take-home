import { DEPLOYMENT_SPENT } from "./deployment-budget";

/**
 * The limits on the paid model calls outside a run (QA F18, security review S10, the owner's call 2026-09-24): Check
 * again once a minute per run, and a few automation drafts per workspace every 10 minutes. Pure, so every edge is
 * unit-tested; the database reads live in model-spend.ts.
 */
export const RECHECK_EVERY_MS = 60_000;
export const DRAFTS_PER_WINDOW = 3;
export const DRAFTS_WINDOW_MS = 10 * 60_000;

/** null when a run's result may be checked again; `lastAt` is when it was last checked again, or null for never. */
export function recheckRefusal(lastAt: Date | null, now: Date): string | null {
  if (!lastAt) return null;
  const waitMs = lastAt.getTime() + RECHECK_EVERY_MS - now.getTime();
  if (waitMs <= 0) return null;
  const seconds = Math.ceil(waitMs / 1000); // rounded up: never told to come back too early
  return `This result was checked a moment ago. Try again in ${seconds} ${seconds === 1 ? "second" : "seconds"}.`;
}

/** null when the workspace may draft another automation; `times` are its drafts, any age, any order. */
export function draftRefusal(times: Date[], now: Date): string | null {
  const recent = times.map((t) => t.getTime()).filter((t) => now.getTime() - t < DRAFTS_WINDOW_MS);
  if (recent.length < DRAFTS_PER_WINDOW) return null;
  const waitMs = Math.min(...recent) + DRAFTS_WINDOW_MS - now.getTime(); // when the oldest leaves the window
  const minutes = Math.max(1, Math.ceil(waitMs / 60_000));
  const when = minutes === 1 ? "about a minute" : `about ${minutes} minutes`;
  return `This workspace has drafted ${DRAFTS_PER_WINDOW} automations in the last 10 minutes. Try again in ${when}.`;
}

/**
 * null while the workspace and the deployment have money left today. A check or a draft costs cents, so only a day
 * already spent refuses it; the runs' reservations (budget-rule.ts) are for runs, which may cost a dollar each.
 */
export function spentRefusal(day: {
  workspaceSpentUsd: number;
  workspaceBudgetUsd: number;
  deploymentSpentUsd: number;
  deploymentBudgetUsd: number;
  resetsAt: string;
}): string | null {
  if (day.deploymentSpentUsd >= day.deploymentBudgetUsd) return DEPLOYMENT_SPENT;
  if (day.workspaceSpentUsd >= day.workspaceBudgetUsd) {
    const clock = new Date(day.resetsAt).toISOString().slice(11, 16); // "2026-09-25T00:00:00.000Z" -> "00:00"
    return `This workspace has spent its $${day.workspaceBudgetUsd.toFixed(2)} budget for today. Try again after ${clock} UTC.`;
  }
  return null;
}

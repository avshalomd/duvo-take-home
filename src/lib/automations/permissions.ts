import type { SessionCtx } from "@/contracts/auth";
import type { AutomationStatus, Trial } from "@/contracts/automation";

// Q178 (his decision): anyone in the workspace drafts an automation, edits it, runs examples and judges them. Only an
// owner or an admin approves it, turns it off or on, deletes it or sets its schedule. Approval is the human gate that
// lets instructions a user wrote reach the agent, so the person approving must be accountable for the workspace; the
// other three change what runs for everyone (a command put back in service, one taken away, runs nobody starts).

export type GovernedAct = "approve" | "status" | "delete" | "schedule";

const REFUSAL: Record<GovernedAct, string> = {
  approve: "Only an owner or an admin can approve an automation.",
  status: "Only an owner or an admin can turn an automation off or on.",
  delete: "Only an owner or an admin can delete an automation.",
  schedule: "Only an owner or an admin can set an automation's schedule.",
};

/** An allowlist, so a role added later starts without these rights. The pages use it to show a member plain lines. */
export function canGovernAutomations(role: SessionCtx["role"]): boolean {
  return role === "owner" || role === "admin";
}

/** The sentence a refused action returns, or null when the role may do it. */
export function refusalFor(role: SessionCtx["role"], act: GovernedAct): string | null {
  return canGovernAutomations(role) ? null : REFUSAL[act];
}

export const APPROVED_COMMAND_LOCKED = "Only an owner or an admin can change the command of an approved automation.";

/**
 * Whether the automation has been approved: it is now (Ready or Off), or an example of an earlier version was marked
 * looks right. Approving needs such an example, and it is the one trace an approval leaves once an edit has sent the
 * automation back to draft (the edit clears approvedAt; no column keeps the history). A draft whose earlier example
 * looked right but that nobody approved counts too: the rule errs toward asking an owner or an admin (review R2).
 */
export function hasBeenApproved(status: AutomationStatus, version: number, trials: Pick<Trial, "version" | "humanVerdict">[]): boolean {
  return status !== "draft" || trials.some((t) => t.version < version && t.humanVerdict === "approved");
}

/**
 * A command is anyone's to change until the automation has been approved. From then on people call it by that command,
 * and renaming it takes it from them with no approval step, so only an owner or an admin may; an edit that sends it back
 * to draft does not change that. Null when allowed. The store's write holds the same rule (updateAutomation), since an
 * approval can land between this check and the save.
 */
export function commandRefusal(role: SessionCtx["role"], approvedBefore: boolean): string | null {
  if (!approvedBefore || canGovernAutomations(role)) return null;
  return APPROVED_COMMAND_LOCKED;
}

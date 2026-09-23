import type { SessionCtx } from "@/contracts/auth";
import type { AutomationStatus } from "@/contracts/automation";

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

/**
 * A draft's command is anyone's to change. Once approved (Ready or Off), people call it by that command, and renaming it
 * takes it from them with no approval step, so only an owner or an admin may. Null when allowed.
 */
export function commandRefusal(role: SessionCtx["role"], status: AutomationStatus): string | null {
  if (status === "draft" || canGovernAutomations(role)) return null;
  return "Only an owner or an admin can change the command of an approved automation.";
}

import { describe, expect, it } from "vitest";
import { canGovernAutomations, refusalFor, type GovernedAct } from "./permissions";

// Q178 (his decision): anyone in the workspace drafts, edits, tries and judges an automation; only an owner or an
// admin approves it, turns it off or on, deletes it or sets its schedule.
const ACTS: GovernedAct[] = ["approve", "status", "delete", "schedule"];

describe("who governs a workspace's automations", () => {
  it.each(["owner", "admin"] as const)("an %s approves, switches, deletes and schedules", (role) => {
    expect(canGovernAutomations(role)).toBe(true);
    for (const act of ACTS) expect(refusalFor(role, act)).toBeNull();
  });

  it("a member does none of the four", () => {
    expect(canGovernAutomations("member")).toBe(false);
    for (const act of ACTS) expect(refusalFor("member", act)).toMatch(/^Only an owner or an admin can /);
  });

  it("refuses a member in words that name what was refused", () => {
    expect(refusalFor("member", "approve")).toBe("Only an owner or an admin can approve an automation.");
    expect(refusalFor("member", "status")).toBe("Only an owner or an admin can turn an automation off or on.");
    expect(refusalFor("member", "delete")).toBe("Only an owner or an admin can delete an automation.");
    expect(refusalFor("member", "schedule")).toBe("Only an owner or an admin can set an automation's schedule.");
  });

  it("treats a role it does not know as a member: an allowlist, so a new role starts without these rights", () => {
    expect(canGovernAutomations("guest" as never)).toBe(false);
  });
});

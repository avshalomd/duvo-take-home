import { describe, expect, it } from "vitest";
import { canGovernAutomations, commandRefusal, hasBeenApproved, refusalFor, type GovernedAct } from "./permissions";

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

// Review R2: any edit of what the agent is told sends a Ready automation back to draft, so "a draft" alone let a
// member rename an approved command in two saves. Approval leaves one trace once that edit has cleared it: an example
// of an earlier version marked looks right, which approving needed.
describe("whether an automation has been approved, for its command", () => {
  it.each(["active", "disabled"] as const)("is so while it is approved (%s)", (status) => {
    expect(hasBeenApproved(status, 1, [])).toBe(true);
  });

  it("stays so once an edit has sent it back to draft: an example of an earlier version looked right", () => {
    expect(hasBeenApproved("draft", 2, [{ version: 1, humanVerdict: "approved" }])).toBe(true);
  });

  it("is not so for a draft whose examples looking right are of this version, or whose earlier ones did not look right", () => {
    expect(hasBeenApproved("draft", 1, [{ version: 1, humanVerdict: "approved" }])).toBe(false);
    expect(hasBeenApproved("draft", 2, [{ version: 1, humanVerdict: "rejected" }, { version: 1, humanVerdict: null }])).toBe(false);
    expect(hasBeenApproved("draft", 1, [])).toBe(false);
  });
});

// People call an approved automation by its command, so renaming it takes it from them without an approval step.
describe("who may change an automation's command", () => {
  it("anyone, while it has never been approved", () => {
    for (const role of ["owner", "admin", "member"] as const) expect(commandRefusal(role, false)).toBeNull();
  });

  it("only an owner or an admin once it has been approved, whatever its status now", () => {
    expect(commandRefusal("owner", true)).toBeNull();
    expect(commandRefusal("admin", true)).toBeNull();
    expect(commandRefusal("member", true)).toBe("Only an owner or an admin can change the command of an approved automation.");
  });
});

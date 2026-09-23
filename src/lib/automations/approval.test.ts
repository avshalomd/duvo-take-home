import { describe, expect, it } from "vitest";
import type { Trial } from "@/contracts/automation";
import { approvalLabel, approvalProgress, memberApprovalLine } from "./approval";
import { canApprove } from "./template";

const trial = (over: Partial<Trial>): Trial => ({
  runId: Math.random().toString(36),
  input: "Apple Inc.",
  version: 2,
  status: "succeeded",
  outcome: "pass",
  humanVerdict: null,
  humanVerdictBy: null,
  humanNote: null,
  createdAt: "2026-09-23T10:00:00.000Z",
  ...over,
});

describe("approvalProgress", () => {
  it("counts the examples of the current version by the person's judgment, one segment each", () => {
    const p = approvalProgress([trial({ humanVerdict: "approved" }), trial({ humanVerdict: "rejected" }), trial({ status: "running", outcome: null })], 2);
    expect(p).toEqual({ total: 3, right: 1, wrong: 1, open: 1, segments: ["right", "wrong", "open"] });
  });

  it("leaves out the examples of an earlier version", () => {
    expect(approvalProgress([trial({ version: 1, humanVerdict: "approved" })], 2)).toEqual({ total: 0, right: 0, wrong: 0, open: 0, segments: [] });
  });
});

describe("approvalLabel", () => {
  it("says how many look right out of how many", () => {
    expect(approvalLabel({ total: 1, right: 1, wrong: 0, open: 0, segments: ["right"] })).toBe("1 of 1 looks right");
    expect(approvalLabel({ total: 2, right: 2, wrong: 0, open: 0, segments: ["right", "right"] })).toBe("2 of 2 look right");
  });

  it("names the ones marked not right", () => {
    expect(approvalLabel({ total: 2, right: 1, wrong: 1, open: 0, segments: ["right", "wrong"] })).toBe("1 of 2 looks right, 1 not right");
  });

  it("says there is nothing to judge yet when no example of this version exists", () => {
    expect(approvalLabel({ total: 0, right: 0, wrong: 0, open: 0, segments: [] })).toBe("No examples of this version yet");
  });
});

// UX R2: with one example not right and one looking right, a member read "An owner or an admin approves it once an
// example looks right" - false, while the owner saw the real blocker. Running, judging and changing it are theirs too.
describe("the line a member reads under the approval bar (Q178)", () => {
  it("is the same next step an owner or an admin is given, while it cannot be approved yet", () => {
    const blocked = canApprove([trial({ humanVerdict: "rejected" }), trial({ humanVerdict: "approved" })], 2);
    expect(blocked.ok).toBe(false);
    const reason = blocked.ok ? null : blocked.reason;
    expect(memberApprovalLine(false, reason)).toBe("An example of this version is marked not right. Change the automation, then run a new example.");
    expect(memberApprovalLine(false, "Run an example first.")).toBe("Run an example first.");
  });

  it("says who approves it once it can be approved", () => {
    expect(memberApprovalLine(true, null)).toBe("An owner or an admin approves it.");
  });
});

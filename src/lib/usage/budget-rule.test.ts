// The budget decision, pure: may a run start, given the workspace's limits and what it used today?
import { describe, expect, it } from "vitest";
import type { Usage, WorkspaceLimits } from "@/contracts/usage";
import { budgetBlockReason, nextUtcMidnight, startOfUtcDay } from "./budget-rule";

const limits: WorkspaceLimits = {
  dailyBudgetUsd: 5,
  dailyRunLimit: 30,
  maxInFlight: 3,
  stepChecks: true,
  strictConnections: false,
  deniedDomains: [],
  autoHealAttempts: 2,
};
const RESET = "2026-09-24T00:00:00.000Z";
const usage = (over: Partial<Usage> = {}): Usage => ({ runsToday: 4, costTodayUsd: 0.42, inFlight: 1, resetsAt: RESET, ...over });

describe("budgetBlockReason", () => {
  it("lets a run start while every limit has room", () => {
    expect(budgetBlockReason(limits, usage())).toBeNull();
  });

  it("stops the 31st run of the day and says when more can start", () => {
    expect(budgetBlockReason(limits, usage({ runsToday: 30 }))).toBe(
      "This workspace has used its 30 runs for today. More can start after 00:00 UTC.",
    );
  });

  it("lets the 30th run start: the limit counts the runs already started", () => {
    expect(budgetBlockReason(limits, usage({ runsToday: 29 }))).toBeNull();
  });

  it("says 'run', not 'runs', when the daily limit is one", () => {
    expect(budgetBlockReason({ ...limits, dailyRunLimit: 1 }, usage({ runsToday: 1 }))).toBe(
      "This workspace has used its 1 run for today. More can start after 00:00 UTC.",
    );
  });

  it("stops a run once the day's spend has reached the budget, in dollars with cents", () => {
    expect(budgetBlockReason(limits, usage({ costTodayUsd: 5.01 }))).toBe(
      "This workspace has spent its $5.00 budget for today. More can start after 00:00 UTC.",
    );
    expect(budgetBlockReason(limits, usage({ costTodayUsd: 5 }))).not.toBeNull();
  });

  it("lets a run start just under the budget", () => {
    expect(budgetBlockReason(limits, usage({ costTodayUsd: 4.99 }))).toBeNull();
  });

  it("treats a budget of zero as no spending at all today", () => {
    expect(budgetBlockReason({ ...limits, dailyBudgetUsd: 0 }, usage({ costTodayUsd: 0 }))).toMatch(/spent its \$0\.00 budget/);
  });

  it("asks to wait when the workspace already has as many runs working as it allows", () => {
    expect(budgetBlockReason(limits, usage({ inFlight: 3 }))).toBe("3 runs are already working. Wait for one to finish.");
  });

  it("says it of one run in the singular", () => {
    expect(budgetBlockReason({ ...limits, maxInFlight: 1 }, usage({ inFlight: 1 }))).toBe(
      "1 run is already working. Wait for it to finish.",
    );
  });

  it("names the day's limit before the runs in progress, because waiting would not help", () => {
    expect(budgetBlockReason(limits, usage({ runsToday: 30, inFlight: 3 }))).toMatch(/used its 30 runs/);
  });

  it("names the runs before the money when both are spent", () => {
    expect(budgetBlockReason(limits, usage({ runsToday: 30, costTodayUsd: 9 }))).toMatch(/used its 30 runs/);
  });

  it("states the reset time it is given, in UTC", () => {
    expect(budgetBlockReason(limits, usage({ runsToday: 30, resetsAt: "2026-09-24T00:00:00.000Z" }))).toContain("after 00:00 UTC");
  });
});

describe("the day's boundaries, in UTC", () => {
  it("starts the day at 00:00 UTC, whatever the hour", () => {
    expect(startOfUtcDay(new Date("2026-09-23T17:45:12.000Z")).toISOString()).toBe("2026-09-23T00:00:00.000Z");
  });

  it("resets at the next 00:00 UTC", () => {
    expect(nextUtcMidnight(new Date("2026-09-23T17:45:12.000Z")).toISOString()).toBe("2026-09-24T00:00:00.000Z");
  });

  it("resets at the following midnight when it is exactly midnight now", () => {
    expect(nextUtcMidnight(new Date("2026-09-23T00:00:00.000Z")).toISOString()).toBe("2026-09-24T00:00:00.000Z");
  });

  it("crosses a month end", () => {
    expect(nextUtcMidnight(new Date("2026-09-30T23:59:59.000Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});

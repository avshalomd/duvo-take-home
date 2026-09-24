// The budget decision, pure: may a run start, given the workspace's limits and what it used today?
import { describe, expect, it } from "vitest";
import type { Usage, WorkspaceLimits } from "@/contracts/usage";
import { budgetBlockReason, healBudgetReason, nextUtcMidnight, startOfUtcDay, startRefusal } from "./budget-rule";

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

  // Engine review #7, the owner's call: a run's cost is known only when an attempt finishes, so the runs in flight
  // counted $0 and the day could close several dollars over. Each run in flight, and the new one, now holds back the
  // most an attempt may cost (AgentLimits.maxBudgetUsd, $1), so the day's limit is never passed.
  it("lets a run start while its own dollar and one for each run working fit in the budget", () => {
    expect(budgetBlockReason(limits, usage({ costTodayUsd: 3, inFlight: 1 }))).toBeNull(); // 3 + 1 working + 1 new = 5
  });

  it("refuses a run whose own worst case would pass the day's budget, saying what is left", () => {
    expect(budgetBlockReason(limits, usage({ costTodayUsd: 4.2, inFlight: 0 }))).toBe(
      "This workspace has $0.80 left of its $5.00 budget for today, and a run may cost up to $1.00. More can start after 00:00 UTC.",
    );
  });

  it("asks to wait when the runs already working may use the rest of the budget", () => {
    expect(budgetBlockReason(limits, usage({ costTodayUsd: 2.5, inFlight: 2 }))).toBe(
      "The runs already working may use the rest of today's $5.00 budget. Wait for one to finish.",
    );
    expect(budgetBlockReason(limits, usage({ costTodayUsd: 3.5, inFlight: 1 }))).toBe(
      "The run already working may use the rest of today's $5.00 budget. Wait for it to finish.",
    );
  });

  // QA F17: a budget of $0.001 was refused as "its $0.00 budget"
  it("names the budget as it was set: cents as cents, and a fraction of a cent saved before cents were enforced as it is", () => {
    expect(budgetBlockReason({ ...limits, dailyBudgetUsd: 2.5 }, usage({ costTodayUsd: 3 }))).toMatch(/spent its \$2\.50 budget/);
    expect(budgetBlockReason({ ...limits, dailyBudgetUsd: 0.07000000029802322 }, usage({ costTodayUsd: 1 }))).toMatch(/spent its \$0\.07 budget/); // a real column reads 0.07 back so
    expect(budgetBlockReason({ ...limits, dailyBudgetUsd: 0.001 }, usage({ costTodayUsd: 1 }))).toMatch(/spent its \$0\.001 budget/);
    expect(healBudgetReason({ dailyBudgetUsd: 0.001 }, 1, 0)).toMatch(/\$0\.001 budget/);
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

// UX QA U3 (his call, 2026-09-24): Home knows before the press whether the workspace's limits refuse a start, so Run
// is refused in the box; and whether the refusal lifts when a run settles, so Home knows to read it again then
describe("startRefusal", () => {
  it("is null while a run may start", () => {
    expect(startRefusal(limits, usage())).toBeNull();
  });

  it("gives the same reason the start itself gives", () => {
    expect(startRefusal(limits, usage({ inFlight: 3 }))?.reason).toBe(budgetBlockReason(limits, usage({ inFlight: 3 })));
  });

  it("waits for a run when runs in flight are what refuse it: at the limit, or holding back the rest of the budget", () => {
    expect(startRefusal(limits, usage({ inFlight: 3 }))?.waitsForRun).toBe(true);
    expect(startRefusal(limits, usage({ inFlight: 2, costTodayUsd: 2.5 }))?.waitsForRun).toBe(true);
  });

  it("does not wait for a run when the day itself is used up: only midnight lifts it", () => {
    expect(startRefusal(limits, usage({ runsToday: 30 }))?.waitsForRun).toBe(false);
    expect(startRefusal(limits, usage({ costTodayUsd: 5, inFlight: 3 }))?.waitsForRun).toBe(false);
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

// Each fix attempt of a run may cost up to AgentLimits.maxBudgetUsd, and nothing checked the day's money before one.
describe("healBudgetReason", () => {
  it("lets a fix attempt start while its dollar and one for each other run working fit in the budget", () => {
    expect(healBudgetReason({ dailyBudgetUsd: 5 }, 3, 1)).toBeNull(); // 3 + 1 working + 1 fix = 5
  });

  it("stops healing once the day's budget is spent, and says so in plain words", () => {
    expect(healBudgetReason({ dailyBudgetUsd: 5 }, 5, 0)).toBe("The workspace's $5.00 budget for today is spent, so healing stopped here.");
    expect(healBudgetReason({ dailyBudgetUsd: 5 }, 7.2, 0)).toBe("The workspace's $5.00 budget for today is spent, so healing stopped here.");
  });

  // Engine review #7: a fix attempt may cost up to $1, and the runs in flight had counted $0.
  it("stops healing when a fix attempt's worst case would pass the budget", () => {
    expect(healBudgetReason({ dailyBudgetUsd: 5 }, 4.6, 0)).toBe(
      "The workspace has $0.40 left of its $5.00 budget for today, less than a fix may cost ($1.00), so healing stopped here.",
    );
  });

  it("stops healing when the other runs working may use the rest of the budget", () => {
    expect(healBudgetReason({ dailyBudgetUsd: 5 }, 2.5, 2)).toBe(
      "The other runs working may use the rest of today's $5.00 budget, so healing stopped here.",
    );
  });
});

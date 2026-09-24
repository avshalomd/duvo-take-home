import { describe, expect, it } from "vitest";
import { DEPLOYMENT_SPENT, deploymentBudgetReason, deploymentDailyBudget } from "./deployment-budget";

// Security review S1, his call (2026-09-24): every workspace had a budget of its own, but nothing capped what the whole
// deployment spends on the operator's model key in a day. Runs in flight are reserved at their most (AgentLimits
// .maxBudgetUsd, $1 each), since their cost is known only when they end.
describe("deploymentDailyBudget", () => {
  it("is $50 a day unless DEPLOYMENT_DAILY_BUDGET_USD says otherwise", () => {
    expect(deploymentDailyBudget(undefined)).toBe(50);
    expect(deploymentDailyBudget("120")).toBe(120);
    expect(deploymentDailyBudget("0")).toBe(0);
  });

  it("keeps the default for a value that is not an amount, so a typo never lifts the cap", () => {
    for (const value of ["", "abc", "-5", "Infinity"]) expect(deploymentDailyBudget(value)).toBe(50);
  });
});

describe("deploymentBudgetReason", () => {
  it("lets a run start while the day's spend and the runs in flight leave room", () => {
    expect(deploymentBudgetReason({ spentTodayUsd: 12.5, inFlight: 3, budgetUsd: 50 })).toBeNull();
  });

  it("refuses once what was spent today reaches the budget, in plain words", () => {
    expect(deploymentBudgetReason({ spentTodayUsd: 50, inFlight: 0, budgetUsd: 50 })).toBe("Handover has reached today's spending limit. Try again tomorrow.");
    expect(DEPLOYMENT_SPENT).toBe("Handover has reached today's spending limit. Try again tomorrow.");
  });

  it("counts each run in flight at its most, so runs started together cannot overshoot the budget", () => {
    expect(deploymentBudgetReason({ spentTodayUsd: 47, inFlight: 3, budgetUsd: 50 })).toBe(DEPLOYMENT_SPENT);
    expect(deploymentBudgetReason({ spentTodayUsd: 47, inFlight: 2, budgetUsd: 50 })).toBeNull();
  });

  it("starts nothing with a budget of 0", () => {
    expect(deploymentBudgetReason({ spentTodayUsd: 0, inFlight: 0, budgetUsd: 0 })).toBe(DEPLOYMENT_SPENT);
  });
});

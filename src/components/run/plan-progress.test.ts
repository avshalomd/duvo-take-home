import { describe, expect, it } from "vitest";
import type { Plan } from "@/contracts/run";
import { planProgress } from "./plan-progress";

const plan = (statuses: Plan["steps"][number]["status"][]): Plan => ({
  intent: "",
  expectedOutputs: [],
  sources: [],
  steps: statuses.map((status, index) => ({ index, title: `step ${index}`, status })),
});

describe("planProgress", () => {
  it("is null when the agent has not set a plan, so no bar is drawn", () => {
    expect(planProgress(null)).toBeNull();
    expect(planProgress(plan([]))).toBeNull();
  });

  it("counts a skipped step as settled: the bar tracks what is left to do", () => {
    expect(planProgress(plan(["done", "skipped", "running", "pending", "pending"]))).toEqual({
      done: 1,
      skipped: 1,
      total: 5,
      percent: 40,
      label: "1 of 5 done, 1 skipped",
    });
  });

  // Q114: "4 of 4" over a plan with a skipped step claimed four steps were done
  it("says how many steps were done, and how many skipped, separately", () => {
    expect(planProgress(plan(["done", "done", "done", "skipped"]))?.label).toBe("3 of 4 done, 1 skipped");
    expect(planProgress(plan(["done", "done"]))?.label).toBe("2 of 2 done");
  });

  it("reaches 100% when every step is done", () => {
    expect(planProgress(plan(["done", "done"]))?.percent).toBe(100);
  });
});

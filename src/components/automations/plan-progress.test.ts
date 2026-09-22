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
      done: 2,
      total: 5,
      percent: 40,
      label: "2 of 5 steps",
    });
  });

  it("reaches 100% when every step is done", () => {
    expect(planProgress(plan(["done", "done"]))?.percent).toBe(100);
  });
});

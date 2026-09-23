import { describe, expect, it } from "vitest";
import type { Plan, PlanStep } from "@/contracts/run";
import { newlyDone } from "./plan-diff";

const plan = (...statuses: PlanStep["status"][]): Plan => ({
  intent: "news to csv",
  expectedOutputs: ["output.csv"],
  sources: [],
  steps: statuses.map((status, index) => ({ index, title: `step ${index}`, status })),
});

describe("newlyDone", () => {
  it("names the step that just turned done", () => {
    expect(newlyDone(plan("running", "pending"), plan("done", "pending"))).toEqual([0]);
  });

  it("does not name a step that was already done in the plan before", () => {
    expect(newlyDone(plan("done", "running"), plan("done", "done"))).toEqual([1]);
  });

  it("names every done step of the first plan, when there was no plan before", () => {
    expect(newlyDone(null, plan("done", "done", "pending"))).toEqual([0, 1]);
  });

  it("ignores a step that was skipped: there is nothing to check", () => {
    expect(newlyDone(plan("running"), plan("skipped"))).toEqual([]);
  });

  it("names nothing when a plan update changes only notes or running steps", () => {
    expect(newlyDone(plan("done", "pending"), plan("done", "running"))).toEqual([]);
  });

  it("treats a step the earlier plan did not have (a new set_plan) as newly done", () => {
    expect(newlyDone(plan("done"), plan("done", "done"))).toEqual([1]);
  });
});

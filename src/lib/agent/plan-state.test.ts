import { describe, expect, it } from "vitest";
import type { Plan } from "@/contracts/run";
import { untickedMarked } from "./plan-state";

const plan = (statuses: Plan["steps"][number]["status"][]): Plan => ({
  intent: "Working days in Norway, October 2026",
  expectedOutputs: ["an answer"],
  sources: [],
  steps: statuses.map((status, index) => ({ index, title: `Step ${index + 1}`, status, ...(index === 1 ? { note: "checked the calendar" } : {}) })),
});

// qa-ai F8 (the owner's call): the agent answered right and forgot to tick steps 2 and 3, and the run read "1 of 3 done"
// with "Not started" steps. When the agent ends successfully, code marks what it left as "not marked".
describe("untickedMarked", () => {
  it("marks the steps a successful agent left pending or running as not marked, keeping their notes", () => {
    expect(untickedMarked(plan(["done", "running", "pending"]))?.steps).toEqual([
      { index: 0, title: "Step 1", status: "done" },
      { index: 1, title: "Step 2", status: "unmarked", note: "checked the calendar" },
      { index: 2, title: "Step 3", status: "unmarked" },
    ]);
  });

  it("leaves done and skipped steps as they are", () => {
    expect(untickedMarked(plan(["done", "skipped", "pending"]))?.steps.map((s) => s.status)).toEqual(["done", "skipped", "unmarked"]);
  });

  it("is null when every step is settled, or there is no plan: nothing to write", () => {
    expect(untickedMarked(plan(["done", "skipped"]))).toBeNull();
    expect(untickedMarked(null)).toBeNull();
  });
});

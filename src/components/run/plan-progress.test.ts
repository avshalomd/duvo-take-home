import { describe, expect, it } from "vitest";
import type { Plan } from "@/contracts/run";
import type { Heal } from "./heal";
import { planProgress } from "./plan-progress";
import { threadSteps } from "./thread-steps";

const plan = (statuses: Plan["steps"][number]["status"][]): Plan => ({
  intent: "",
  expectedOutputs: [],
  sources: [],
  steps: statuses.map((status, index) => ({ index, title: `step ${index}`, status })),
});
// the line counts what the thread draws: the plan's steps, then any attempt to fix the result
const progress = (p: Plan | null, status = "succeeded", heals: Heal[] = []) => planProgress(p, threadSteps(p, status, [], heals));

describe("planProgress", () => {
  it("is null when the agent has not set a plan, so no bar is drawn", () => {
    expect(progress(null)).toBeNull();
    expect(progress(null, "running")).toBeNull(); // the "Reading your brief" step is not a plan to count
    expect(progress(plan([]))).toBeNull();
  });

  it("counts a skipped step as settled: the bar tracks what is left to do", () => {
    expect(progress(plan(["done", "skipped", "running", "pending", "pending"]), "running")).toEqual({
      done: 1,
      skipped: 1,
      total: 5,
      percent: 40,
      label: "1 of 5 done, 1 skipped",
    });
  });

  // Q114: "4 of 4" over a plan with a skipped step claimed four steps were done
  it("says how many steps were done, and how many skipped, separately", () => {
    expect(progress(plan(["done", "done", "done", "skipped"]))?.label).toBe("3 of 4 done, 1 skipped");
    expect(progress(plan(["done", "done"]))?.label).toBe("2 of 2 done");
  });

  // qa-ai F8: "1 of 3 done" read as work not started above a correct answer
  it("counts the steps a finished run did not tick apart, as not marked, and as settled", () => {
    const p = progress(plan(["done", "unmarked", "unmarked"]));
    expect(p?.label).toBe("1 of 3 done, 2 not marked");
    expect(p?.percent).toBe(100);
  });

  it("reaches 100% when every step is done", () => {
    expect(progress(plan(["done", "done"]))?.percent).toBe(100);
  });

  // "3 of 3 done" sat above four nodes when the run had fixed its result: the fix is a step on the thread too
  it("counts each attempt to fix the result, so the line and the thread agree", () => {
    const fixed: Heal[] = [{ attempt: 1, max: 2, reasons: ["The CSV parses: countries.csv: row 5 has 6 fields"], stopped: false }];
    expect(progress(plan(["done", "done", "done"]), "succeeded", fixed)?.label).toBe("4 of 4 done");
    expect(progress(plan(["done", "done", "done"]), "running", fixed)?.label).toBe("3 of 4 done");
    const stopped: Heal[] = [...fixed, { attempt: 2, max: 2, reasons: [], stopped: true }];
    expect(progress(plan(["done", "done", "done"]), "succeeded", stopped)?.label).toBe("4 of 5 done, 1 skipped");
  });
});

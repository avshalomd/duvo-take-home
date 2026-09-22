import { describe, expect, it } from "vitest";
import type { Plan } from "@/contracts/run";
import { barTone, planProgress } from "./plan-progress";

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

// Q67: a full emerald bar over a red outcome told two different stories about the same run.
describe("barTone", () => {
  it("is emerald only when the judge passed the result", () => {
    expect(barTone("pass", true)).toBe("pass");
  });

  it("is amber when the result passed with notes", () => {
    expect(barTone("pass_with_notes", true)).toBe("warn");
  });

  it("stays neutral when the result failed, was not checked, or is not judged yet", () => {
    expect(barTone("fail", true)).toBe("neutral");
    expect(barTone("unknown", true)).toBe("neutral");
    expect(barTone(null, true)).toBe("neutral");
  });

  it("stays neutral while nothing is done, whatever the verdict says", () => {
    expect(barTone("pass", false)).toBe("neutral");
  });
});

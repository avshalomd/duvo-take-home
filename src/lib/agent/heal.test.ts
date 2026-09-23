import { describe, expect, it } from "vitest";
import { AgentLimits } from "@/contracts/agent";
import { healPrompt, MIN_HEAL_MS, runBudgetMs, shouldHeal } from "./heal";

describe("runBudgetMs", () => {
  it("inline, keeps every attempt inside the one wall clock the function allows", () => {
    expect(runBudgetMs("inline")).toBe(AgentLimits.wallClockMs);
  });

  it("in the worker, allows more but stays under the 10-minute stale lock, so a healing run is never taken for dead", () => {
    expect(runBudgetMs("queue")).toBe(6 * 60_000);
  });
});

describe("shouldHeal", () => {
  const due = { healable: true, healsSoFar: 0, limit: 2, remainingMs: 120_000 };

  it("gives a healable failure another attempt while attempts and time are left", () => {
    expect(shouldHeal(due)).toBe(true);
    expect(shouldHeal({ ...due, healsSoFar: 1 })).toBe(true);
  });

  it("never heals when the workspace turned it off (limit 0)", () => {
    expect(shouldHeal({ ...due, limit: 0 })).toBe(false);
  });

  it("stops once the workspace's number of attempts is used", () => {
    expect(shouldHeal({ ...due, healsSoFar: 2 })).toBe(false);
  });

  it("does not start an attempt with less than a minute left: it would be cut off half way", () => {
    expect(shouldHeal({ ...due, remainingMs: MIN_HEAL_MS - 1 })).toBe(false);
    expect(shouldHeal({ ...due, remainingMs: MIN_HEAL_MS })).toBe(true);
  });

  it("does not heal what the agent cannot fix (a judge that was down, a run it did not finish)", () => {
    expect(shouldHeal({ ...due, healable: false })).toBe(false);
  });
});

describe("healPrompt", () => {
  const feedback = "The CSV parses: output.csv: row 7 has 8 fields, the header has 7";

  it("carries the evaluator's findings word for word", () => {
    expect(healPrompt(feedback)).toContain(feedback);
  });

  it("tells the agent to fix the files in its working directory under the same names, then report again", () => {
    const p = healPrompt(feedback);
    expect(p).toMatch(/working directory/i);
    expect(p).toMatch(/same name/i);
    expect(p).toMatch(/report/i);
  });

  it("asks it to mark the steps it redoes in its plan, so the person sees the fix happen", () => {
    expect(healPrompt(feedback)).toMatch(/update_step/);
  });
});

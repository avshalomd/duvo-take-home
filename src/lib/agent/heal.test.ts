import { describe, expect, it } from "vitest";
import { AgentLimits } from "@/contracts/agent";
import type { Verdict } from "@/contracts/eval";
import { attemptFingerprint, healPrompt, MIN_HEAL_MS, noProgress, runBudgetMs, shouldHeal } from "./heal";

describe("runBudgetMs", () => {
  it("inline, keeps every attempt inside the one wall clock the function allows", () => {
    expect(runBudgetMs("inline")).toBe(AgentLimits.wallClockMs);
  });

  it("in the runner route, the same: the run lives inside one function call there too", () => {
    expect(runBudgetMs("route")).toBe(AgentLimits.wallClockMs);
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

  it("tells the agent its files are in its working directory, to be written back under the same names", () => {
    const p = healPrompt(feedback);
    expect(p).toMatch(/working directory/i);
    expect(p).toMatch(/same name/i);
  });

  it("asks it to mark the steps it redoes in its plan, so the person sees the fix happen", () => {
    expect(healPrompt(feedback)).toMatch(/update_step/);
  });

  // Q149: feedbackForAgent already opens with its lead and closes with "report what you changed".
  it("uses the feedback as it is, framed once: no second lead or closing line of its own", () => {
    const real = [
      "An automatic check of the result found this to fix:",
      "- In output.csv, row 3 has 3 values but the header has 2: put every value that contains a comma in double quotes.",
      "Fix the files in place, keep what was already right, and report what you changed.",
    ].join("\n");
    const p = healPrompt(real);
    expect(p.startsWith(real)).toBe(true);
    expect(p.match(/automatic check/gi)).toHaveLength(1);
    expect(p.match(/report/gi)).toHaveLength(1);
  });
});

// Q148: the live heal of 2026-09-23 went back and forth - quotes added for the CSV check, removed for the reviewer,
// and the third attempt was the first one again. An attempt that brings back an earlier failure or earlier files
// stops the healing.
describe("noProgress", () => {
  const RAGGED = { id: "parses", label: "The CSV parses", ok: false, detail: "output.csv: row 3 has 3 fields, the header has 2" };
  const failing = (reasons: string[], failed = [RAGGED]): Verdict => ({
    verdict: "fail",
    checks: [{ id: "completed", label: "The run finished", ok: true, detail: "succeeded" }, ...failed],
    judgment: null,
    review: null,
    reasons,
    evaluatedAt: "2026-09-23T12:00:00.000Z",
  });
  const brokenFile = [{ name: "output.csv", content: "item,note\n2,small, cheap\n" }];
  const quotedFile = [{ name: "output.csv", content: 'item,note\n2,"small, cheap"\n' }];
  const first = attemptFingerprint(failing(["The CSV parses: output.csv: row 3 has 3 fields, the header has 2"]), brokenFile);
  const second = attemptFingerprint(failing(["Remove the quotes around \"small, cheap\""], []), quotedFile);

  it("lets an attempt that failed differently, with different files, go on healing", () => {
    expect(noProgress(second, [first])).toBeNull();
  });

  it("stops when the files are byte for byte those of an earlier attempt: the fix undid an earlier one", () => {
    const third = attemptFingerprint(failing(["The judge was unsure (31%)"], []), brokenFile);
    expect(noProgress(third, [first, second])).toBe("The fix undid an earlier one: the files are back to an earlier attempt's, so healing stopped here.");
  });

  it("stops when an attempt fails the same checks with the same details as an earlier one", () => {
    const again = attemptFingerprint(failing(["The judge was unsure (40%)"]), [{ name: "output.csv", content: "item,note\n2,small, cheaper\n" }]);
    expect(noProgress(again, [first])).toBe("This attempt failed the same way as an earlier one, so healing stopped here.");
  });

  it("stops when an attempt fails for the same reasons as an earlier one, even with no code check failing", () => {
    const a = attemptFingerprint(failing(["The reviewer asks: add the sources"], []), brokenFile);
    const b = attemptFingerprint(failing(["The reviewer asks: add the sources"], []), quotedFile);
    expect(noProgress(b, [a])).toBe("This attempt failed the same way as an earlier one, so healing stopped here.");
  });

  it("never stops the first attempt: there is nothing earlier to compare with", () => {
    expect(noProgress(first, [])).toBeNull();
  });

  it("reads the same files in a different order as the same files", () => {
    const two = [...brokenFile, { name: "report.md", content: "# r" }];
    const a = attemptFingerprint(failing(["x"]), two);
    const b = attemptFingerprint(failing(["y"], []), [...two].reverse());
    expect(noProgress(b, [a])).toMatch(/files are back/);
  });
});

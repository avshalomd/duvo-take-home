import { describe, expect, it } from "vitest";
import { Verdict } from "@/contracts/eval";
import { unknownVerdict } from "./unknown-verdict";

describe("unknownVerdict", () => {
  it("is a valid Verdict, so a crashed evaluator still stores something the run page can read", () => {
    expect(() => Verdict.parse(unknownVerdict(new Error("judge route failed")))).not.toThrow();
  });

  it("says unknown rather than nothing, so a run with a crashed evaluator does not read as a pass", () => {
    const v = unknownVerdict(new Error("judge route failed"));
    expect(v.verdict).toBe("unknown");
    expect(v.judgment).toBeNull();
    expect(v.review).toBeNull();
    expect(v.checks).toEqual([]);
  });

  it("carries the evaluator's own words, so Re-evaluate can explain why the run was not checked", () => {
    expect(unknownVerdict(new Error("judge route failed")).reasons).toEqual(["Not checked: judge route failed"]);
  });

  it("reads a thrown non-Error too: a provider can reject with a string", () => {
    expect(unknownVerdict("gateway timeout").reasons).toEqual(["Not checked: gateway timeout"]);
  });
});

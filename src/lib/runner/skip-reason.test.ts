import { describe, expect, it } from "vitest";
import { StartRunInput } from "@/contracts/agent";
import { RunLimitError } from "@/lib/runs/limits";
import { skipReasonOf, MISSED_SLOT } from "./skip-reason";

// Engine review #6, the owner's call: a scheduled start refused by a limit was only logged, so the person saw no run
// and no reason. The reason is stored on the automation and shown beside its schedule, so it must read as plain words.
describe("skipReasonOf", () => {
  it("keeps a limit's own words: they are already written for the person", () => {
    const e = new RunLimitError("This workspace has spent its $5.00 budget for today. More can start after 00:00 UTC.");
    expect(skipReasonOf(e)).toBe("This workspace has spent its $5.00 budget for today. More can start after 00:00 UTC.");
  });

  it("turns instructions that do not pass the start's own check into their rule, never the validator's JSON", () => {
    const tooLong = StartRunInput.safeParse({ prompt: "x".repeat(5000) });
    expect(tooLong.success).toBe(false);
    expect(skipReasonOf(tooLong.error)).toBe("Keep the instructions under 4000 characters.");
  });

  it("says the run could not start for anything else, without the raw error", () => {
    expect(skipReasonOf(new Error("connect ECONNREFUSED 127.0.0.1:5432"))).toBe("The run could not be started.");
  });

  it("says a slot missed while schedules were not checked in plain words", () => {
    expect(MISSED_SLOT).toBe("Schedules were not being checked at that time.");
  });
});

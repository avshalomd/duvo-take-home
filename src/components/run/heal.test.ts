import { describe, expect, it } from "vitest";
import type { RunEvent } from "@/contracts/run";
import { fixesRun, healsOf, ordinal } from "./heal";

const at = "2026-09-23T10:00:00.000Z";
let seq = 0;
const heal = (attempt: number, stopped?: string): RunEvent => ({
  seq: ++seq, at, kind: "heal",
  payload: { attempt, max: 2, reasons: ["At least 8 rows: 3 rows"], feedback: "Add rows.", ...(stopped ? { stopped } : {}) },
});
const stateOf = (events: RunEvent[]) =>
  events.flatMap((e) => (e.kind === "heal" ? [{ attempt: e.payload.attempt, max: e.payload.max, reasons: e.payload.reasons }] : []));
const UNDID = "The fix undid an earlier one: the files are back to an earlier attempt's, so healing stopped here.";

// Auto-heal: every heal event starts a fix inside the same run - except the one the engine records with a reason to
// stop, because the last fix made no progress (Q148). That one is followed by the final verdict, not by an attempt,
// and the engine does not count it among the run's attempts.
describe("healsOf - the attempts to fix the result, and whether the engine stopped trying", () => {
  it("marks no attempt stopped when the engine gave no reason to stop", () => {
    const events = [heal(1)];
    expect(healsOf(stateOf(events), events).map((h) => h.stopped)).toEqual([false]);
  });

  it("marks the attempt the engine stopped, with the engine's own words for Details", () => {
    const events = [heal(1), heal(2, UNDID)];
    const heals = healsOf(stateOf(events), events);
    expect(heals.map((h) => h.stopped)).toEqual([false, true]);
    expect(heals[1].stoppedBecause).toBe(UNDID);
  });

  it("counts only the fixes the agent made, as the engine's heal_attempts does", () => {
    const events = [heal(1), heal(2, UNDID)];
    expect(fixesRun(healsOf(stateOf(events), events))).toBe(1);
  });

  it("has no attempts on a run that never needed one", () => {
    expect(healsOf(undefined, [])).toEqual([]);
  });
});

describe("ordinal - the words for the n-th result", () => {
  it("spells out the first few, which is all a workspace's limit allows", () => {
    expect([1, 2, 3].map(ordinal)).toEqual(["first", "second", "third"]);
    expect(ordinal(12)).toBe("12th");
  });
});

import { describe, expect, it } from "vitest";
import type { RunEvent } from "@/contracts/run";
import { fixesRun, healsOf, ordinal } from "./heal";

const at = "2026-09-23T10:00:00.000Z";
let seq = 0;
const heal = (attempt: number, reasons = ["At least 8 rows: 3 rows"]): RunEvent => ({
  seq: ++seq, at, kind: "heal", payload: { attempt, max: 2, reasons, feedback: "Add rows." },
});
const finished = (): RunEvent => ({
  seq: ++seq, at, kind: "finished",
  payload: { subtype: "success", is_error: false, num_turns: 3, duration_ms: 9000, total_cost_usd: 0.02, result: "Done." },
});
const stateOf = (events: RunEvent[]) =>
  events.flatMap((e) => (e.kind === "heal" ? [{ attempt: e.payload.attempt, max: e.payload.max, reasons: e.payload.reasons }] : []));

// Auto-heal: every heal event starts a fix inside the same run - except the one the engine records and then does not
// run, because the last fix made no progress (Q148). That one is followed by the final verdict, not by an attempt.
describe("healsOf - the attempts to fix the result, and whether the engine stopped trying", () => {
  it("marks no attempt stopped when each one was followed by the agent's work", () => {
    const events = [finished(), heal(1), finished()];
    expect(healsOf(stateOf(events), events, "succeeded").map((h) => h.stopped)).toEqual([false]);
  });

  it("marks the last attempt stopped when the run ended without doing it", () => {
    const events = [finished(), heal(1), finished(), heal(2, ["At least 8 rows: 2 rows"])];
    const heals = healsOf(stateOf(events), events, "succeeded");
    expect(heals.map((h) => h.stopped)).toEqual([false, true]);
    expect(fixesRun(heals)).toBe(1);
  });

  it("never calls an attempt stopped while the run is still working on it", () => {
    const events = [finished(), heal(1)];
    expect(healsOf(stateOf(events), events, "running")[0].stopped).toBe(false);
  });

  it("leaves a run the person stopped mid-fix to the thread's own 'Stopped here'", () => {
    const events = [finished(), heal(1)];
    expect(healsOf(stateOf(events), events, "cancelled")[0].stopped).toBe(false);
  });
});

describe("ordinal - the words for the n-th result", () => {
  it("spells out the first few, which is all a workspace's limit allows", () => {
    expect([1, 2, 3].map(ordinal)).toEqual(["first", "second", "third"]);
    expect(ordinal(12)).toBe("12th");
  });
});

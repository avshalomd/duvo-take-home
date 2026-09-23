import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunEvent } from "@/contracts/run";
import { costStateOf, ownCost, readSdkTotals, stoppedTotals, withAttemptCost } from "./stopped-cost";

// The shape the CLI wrote for a run stopped mid-way on 2026-09-23 (cancel check db56bab3): its own total, written as
// it shut down after the abort - $0.0529 on claude-sonnet-5 plus $0.0459 on the web-search helper model.
const costState = { type: "cost-state", sessionId: "s", totalCostUSD: 0.0987554, totalDuration: 49971, hasUnknownModelCost: false };

afterEach(() => {
  vi.useRealTimers();
});

describe("costStateOf (Q129)", () => {
  it("reads the SDK's own total and duration from the transcript's cost-state entry", () => {
    expect(costStateOf([{ type: "user" }, costState, { type: "assistant" }])).toEqual({ costUsd: 0.0987554, durationMs: 49971 });
  });

  it("takes the last cost-state when there are several (a resumed session writes its own)", () => {
    expect(costStateOf([{ ...costState, totalCostUSD: 0.01 }, costState])?.costUsd).toBe(0.0987554);
  });

  it("answers null when the transcript has no cost-state yet", () => {
    expect(costStateOf([{ type: "user" }, { type: "assistant" }])).toBeNull();
  });

  it("ignores a cost-state without a number, and keeps the cost when the duration is missing", () => {
    expect(costStateOf([{ type: "cost-state", totalCostUSD: "a lot" }])).toBeNull();
    expect(costStateOf([{ type: "cost-state", totalCostUSD: 0.02 }])).toEqual({ costUsd: 0.02, durationMs: null });
  });
});

describe("readSdkTotals (Q129)", () => {
  it("waits for the entry the CLI writes as it shuts down after the abort", async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValueOnce([{ type: "user" }]).mockResolvedValueOnce([{ type: "user" }]).mockResolvedValue([costState]);
    const reading = readSdkTotals("s", { load, waitMs: 3000, everyMs: 250 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await reading).toEqual({ costUsd: 0.0987554, durationMs: 49971 });
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("gives up after waitMs and answers null, so closing the run is never held up for long", async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValue([]);
    const reading = readSdkTotals("s", { load, waitMs: 1000, everyMs: 250 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await reading).toBeNull();
  });

  it("answers null when the transcript cannot be read at all (a session on another machine)", async () => {
    const load = vi.fn().mockRejectedValue(new Error("session not found"));
    expect(await readSdkTotals("s", { load, waitMs: 0 })).toBeNull();
  });
});

describe("stoppedTotals (Q129)", () => {
  const startedAt = Date.parse("2026-09-23T10:00:00Z");
  const now = startedAt + 42_000;

  it("keeps the result's own cost, duration and turns when the agent had finished (Stop during the evaluation)", () => {
    const end = { total_cost_usd: 0.05, duration_ms: 30_000, num_turns: 6 };
    expect(stoppedTotals({ end, sdk: null, startedAt, now, turns: 6 })).toEqual({ costUsd: 0.05, durationMs: 30_000, numTurns: 6 });
  });

  it("takes the SDK's own cost and duration when the agent was stopped mid-way", () => {
    expect(stoppedTotals({ end: null, sdk: { costUsd: 0.0987554, durationMs: 49971 }, startedAt, now, turns: 6 })).toEqual({
      costUsd: 0.0987554,
      durationMs: 49971,
      numTurns: 6,
    });
  });

  it("falls back to the time from start to stop, with no cost, when the SDK left no totals", () => {
    expect(stoppedTotals({ end: null, sdk: null, startedAt, now, turns: 2 })).toEqual({ costUsd: null, durationMs: 42_000, numTurns: 2 });
  });

  it("uses start-to-stop time when the SDK gave a cost but no duration", () => {
    expect(stoppedTotals({ end: null, sdk: { costUsd: 0.02, durationMs: null }, startedAt, now, turns: 1 }).durationMs).toBe(42_000);
  });
});

// Found while checking Q129 on the follow-up of 2026-09-23 (6b1e55df): a resumed session's SDK total starts from the
// parent's saved total ($0.0217 parent + $0.0262 own = the $0.0479 the result reported), so a follow-up's own cost
// is its total minus the total its session was resumed from.
describe("ownCost", () => {
  it("records only a resumed follow-up's own share, not its parent's again", () => {
    expect(ownCost(0.0478918, 0.021683)).toBeCloseTo(0.0262088, 7);
  });

  it("is the whole total for a run that resumed nothing", () => {
    expect(ownCost(0.0217, 0)).toBe(0.0217);
  });

  it("is never negative, whatever the SDK reported", () => {
    expect(ownCost(0.01, 0.02)).toBe(0);
  });

  it("applies to a stopped follow-up too", () => {
    const t = stoppedTotals({ end: null, sdk: { costUsd: 0.05, durationMs: 1000 }, startedAt: 0, now: 2000, turns: 1, costBase: 0.02 });
    expect(t.costUsd).toBeCloseTo(0.03, 10);
  });
});

// Q149: each attempt's finished event keeps the SDK's raw running total, which for a resumed attempt includes the
// earlier ones; its own share goes beside it, so Details can show what each attempt cost.
describe("withAttemptCost", () => {
  const finished: RunEvent = {
    seq: 9,
    at: "t",
    kind: "finished",
    payload: { subtype: "success", is_error: false, num_turns: 3, duration_ms: 1000, total_cost_usd: 0.0652, result: "done" },
  };
  const text: RunEvent = { seq: 8, at: "t", kind: "text", payload: { text: "working" } };

  it("adds the attempt's own cost to its finished event and keeps the SDK's raw total", () => {
    const [out] = withAttemptCost([finished], 0.0304);
    expect(out.payload).toMatchObject({ total_cost_usd: 0.0652 });
    expect((out.payload as unknown as { attempt_cost_usd: number }).attempt_cost_usd).toBeCloseTo(0.0348, 10);
  });

  it("gives the first attempt of a fresh session its whole total", () => {
    expect(withAttemptCost([finished], 0)[0].payload).toMatchObject({ attempt_cost_usd: 0.0652 });
  });

  it("leaves every other event as it is", () => {
    expect(withAttemptCost([text], 0.03)).toEqual([text]);
  });
});

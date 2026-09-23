import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startDeadline, within } from "./deadline";

// A run inline or in the runner route dies with its function at 300 s; what follows the agent - the step checks and
// the evaluation - is waited for only so long, so the run is always closed before that.
describe("within", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("answers with the work's own result when it comes in time", async () => {
    const got = within(new Promise<string>((r) => setTimeout(() => r("judged"), 500)), 1000, () => "too slow");
    await vi.advanceTimersByTimeAsync(500);
    expect(await got).toBe("judged");
  });

  it("answers with the fallback once the time is up, and stops waiting for the work", async () => {
    const got = within(new Promise<string>(() => {}), 1000, () => "too slow"); // a judge that never answers
    await vi.advanceTimersByTimeAsync(1000);
    expect(await got).toBe("too slow");
  });

  it("builds the fallback only when the time is up", async () => {
    const fallback = vi.fn(() => "too slow");
    await within(Promise.resolve("judged"), 1000, fallback);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fallback).not.toHaveBeenCalled();
  });
});

// Q3: AgentLimits.wallClockMs was never enforced - a hung agent kept the run "running" for ever. The loop is a
// subprocess we cannot unit test, so the timer and the abort are their own module and these tests pin them.
describe("startDeadline", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("aborts the controller once the wall clock has run out", () => {
    const d = startDeadline(1000);
    expect(d.controller.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(d.controller.signal.aborted).toBe(true);
  });

  it("reports that it was the deadline that aborted, so the run can say 'timed out' and not just 'aborted'", () => {
    const d = startDeadline(1000);
    expect(d.expired()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(d.expired()).toBe(true);
  });

  it("never aborts a run that finished in time, once its timer is cleared", () => {
    const d = startDeadline(1000);
    d.clear();
    vi.advanceTimersByTime(10_000);
    expect(d.controller.signal.aborted).toBe(false);
    expect(d.expired()).toBe(false);
  });
});

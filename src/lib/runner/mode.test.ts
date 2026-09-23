import { afterEach, describe, expect, it, vi } from "vitest";
import { runnerMode, schedulerRunning } from "./mode";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runnerMode", () => {
  it("is inline by default", () => {
    vi.stubEnv("RUNNER", "");
    expect(runnerMode()).toBe("inline");
  });

  it("is queue with RUNNER=queue, read at call time", () => {
    vi.stubEnv("RUNNER", "queue");
    expect(runnerMode()).toBe("queue");
  });

  it("is route with RUNNER=route: each run gets a function of its own through /api/runner", () => {
    vi.stubEnv("RUNNER", "route");
    expect(runnerMode()).toBe("route");
  });

  it("treats any other value as inline rather than guessing", () => {
    vi.stubEnv("RUNNER", "worker");
    expect(runnerMode()).toBe("inline");
  });
});

describe("schedulerRunning (Q84)", () => {
  it("is true with the worker (RUNNER=queue): it ticks the schedules every 30 s", () => {
    vi.stubEnv("RUNNER", "queue");
    vi.stubEnv("CRON_SECRET", "");
    expect(schedulerRunning()).toBe(true);
  });

  it("is true with CRON_SECRET set: Vercel cron can call the tick", () => {
    vi.stubEnv("RUNNER", "");
    vi.stubEnv("CRON_SECRET", "a-secret");
    expect(schedulerRunning()).toBe(true);
  });

  it("is false inline with no cron secret: nothing would ever fire a schedule", () => {
    vi.stubEnv("RUNNER", "");
    vi.stubEnv("CRON_SECRET", "");
    expect(schedulerRunning()).toBe(false);
  });
});

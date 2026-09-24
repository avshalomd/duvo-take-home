import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The route's own logic is the auth; the tick and the sweep are the runner's, tested elsewhere.
vi.mock("@/lib/runner/schedules", () => ({ tickSchedules: vi.fn(async () => ["run-a", "run-b"]) }));
vi.mock("@/lib/runner/recover", () => ({ closeAbandonedRuns: vi.fn(async () => ["run-old"]) }));
// the real comparison, watched: the secret must be compared in constant time
vi.mock("node:crypto", async (original) => {
  const real = await original<typeof import("node:crypto")>();
  return { ...real, timingSafeEqual: vi.fn(real.timingSafeEqual) };
});

import { timingSafeEqual } from "node:crypto";
import { closeAbandonedRuns } from "@/lib/runner/recover";
import { tickSchedules } from "@/lib/runner/schedules";
import { GET } from "./route";

const SECRET = "test-cron-secret";
const call = (authorization?: string) =>
  GET(new Request("http://localhost/api/cron/tick", { headers: authorization ? { authorization } : {} }));

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.mocked(tickSchedules).mockClear();
  vi.mocked(closeAbandonedRuns).mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/tick", () => {
  // QA F23: the 503 told any visitor which setting was missing
  it("answers a plain 404 and runs nothing when CRON_SECRET is not set, naming no setting", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toMatch(/CRON|secret/i);
    expect(tickSchedules).not.toHaveBeenCalled();
  });

  // Security review S12: the secret was compared with !==, which leaks its length and prefix by timing
  it("compares the secret in constant time, and a longer or shorter guess is refused like any other", async () => {
    expect((await call(`Bearer ${SECRET}x`)).status).toBe(401);
    expect((await call(`Bearer ${SECRET.slice(0, -1)}`)).status).toBe(401);
    expect((await call("Bearer ")).status).toBe(401);
  });

  it("decides a same-length guess with timingSafeEqual", async () => {
    vi.mocked(timingSafeEqual).mockClear();
    expect((await call(`Bearer ${"x".repeat(SECRET.length)}`)).status).toBe(401);
    expect(timingSafeEqual).toHaveBeenCalledTimes(1);
  });

  it("answers 401 without an Authorization header", async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(tickSchedules).not.toHaveBeenCalled();
  });

  it("answers 401 with the wrong secret", async () => {
    expect((await call("Bearer not-the-secret")).status).toBe(401);
    expect(tickSchedules).not.toHaveBeenCalled();
  });

  it("answers 401 for the right secret without the Bearer scheme", async () => {
    expect((await call(SECRET)).status).toBe(401);
  });

  it("with the right bearer, ticks the schedules and sweeps abandoned runs, and says what it did", async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ started: ["run-a", "run-b"], closed: ["run-old"] });
    expect(tickSchedules).toHaveBeenCalledTimes(1);
    expect(vi.mocked(tickSchedules).mock.calls[0][0]).toBeInstanceOf(Date);
    expect(closeAbandonedRuns).toHaveBeenCalledTimes(1);
  });
});

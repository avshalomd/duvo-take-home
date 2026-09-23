import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The route's own logic is the auth; the tick and the sweep are the runner's, tested elsewhere.
vi.mock("@/lib/runner/schedules", () => ({ tickSchedules: vi.fn(async () => ["run-a", "run-b"]) }));
vi.mock("@/lib/runner/recover", () => ({ closeAbandonedRuns: vi.fn(async () => ["run-old"]) }));

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
  it("answers 503 and runs nothing when CRON_SECRET is not set, so an unset secret is never 'no secret needed'", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(503);
    expect(tickSchedules).not.toHaveBeenCalled();
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

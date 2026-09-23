import { beforeEach, describe, expect, it, vi } from "vitest";

const later: Array<() => Promise<void>> = [];
vi.mock("next/server", () => ({ after: (fn: () => Promise<void>) => later.push(fn) }));
vi.mock("@/lib/agent/run", () => ({ runAutomation: vi.fn(async () => {}) }));

import { runAutomation } from "@/lib/agent/run";
import { runnerToken } from "@/lib/runner/token";
import { POST } from "./route";

const RUN = "5b6f0c2e-8a4d-4d8e-9d3b-2f1e0a9c7b11";
const call = (id: string, token?: string) =>
  POST(new Request(`http://localhost/api/runner/${id}`, { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
  vi.mocked(runAutomation).mockClear();
  later.length = 0;
});

describe("POST /api/runner/[id]", () => {
  it("starts the run after answering 202, so the caller's request is not held for the whole run", async () => {
    const res = await call(RUN, runnerToken(RUN));
    expect(res.status).toBe(202);
    expect(runAutomation).not.toHaveBeenCalled();
    await later[0]();
    expect(runAutomation).toHaveBeenCalledWith(RUN);
  });

  it("refuses a call without the token: only this deployment starts runs here", async () => {
    const res = await call(RUN);
    expect(res.status).toBe(401);
    expect(later).toHaveLength(0);
  });

  it("refuses another run's token", async () => {
    const res = await call(RUN, runnerToken("0f0f0f0f-0000-4000-8000-000000000000"));
    expect(res.status).toBe(401);
    expect(later).toHaveLength(0);
  });

  it("logs a run that throws instead of losing it: after() swallows rejections", async () => {
    vi.mocked(runAutomation).mockRejectedValueOnce(new Error("spawn failed"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await call(RUN, runnerToken(RUN));
    await later[0]();
    expect(log).toHaveBeenCalledWith(`run ${RUN} failed`, expect.any(Error));
    log.mockRestore();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const later: Array<() => Promise<void>> = [];
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (fn: () => Promise<void>) => later.push(fn) }));
vi.mock("@/lib/agent/run", () => ({ runAutomation: vi.fn(async () => {}) }));
vi.mock("./jobs", () => ({ insertJob: vi.fn(async () => "job") }));
vi.mock("./fail-start", () => ({ failStart: vi.fn(async () => {}) }));

import { runAutomation } from "@/lib/agent/run";
import { enqueueRun } from "./enqueue";
import { failStart } from "./fail-start";
import { insertJob } from "./jobs";
import { verifyRunnerToken } from "./token";

const RUN = "5b6f0c2e-8a4d-4d8e-9d3b-2f1e0a9c7b11";
const fetchMock = vi.fn();

beforeEach(() => {
  later.length = 0;
  vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
  vi.stubEnv("BETTER_AUTH_URL", "https://handover.example");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.mocked(runAutomation).mockClear();
  vi.mocked(failStart).mockClear();
  vi.mocked(insertJob).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("enqueueRun", () => {
  it("inline: runs the loop in this request's after()", async () => {
    vi.stubEnv("RUNNER", "");
    await enqueueRun(RUN);
    await later[0]();
    expect(runAutomation).toHaveBeenCalledWith(RUN);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("queue: leaves a job for the worker and runs nothing here", async () => {
    vi.stubEnv("RUNNER", "queue");
    await enqueueRun(RUN);
    expect(insertJob).toHaveBeenCalledWith(RUN);
    expect(later).toHaveLength(0);
  });

  it("route: hands the run to /api/runner/<id> on the app's own address, with the run's token", async () => {
    vi.stubEnv("RUNNER", "route");
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
    await enqueueRun(RUN);
    await later[0]();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://handover.example/api/runner/${RUN}`);
    expect(init.method).toBe("POST");
    expect(verifyRunnerToken(RUN, init.headers.authorization.replace("Bearer ", ""))).toBe(true);
    expect(runAutomation).not.toHaveBeenCalled();
    expect(failStart).not.toHaveBeenCalled();
  });

  it("route: closes the run as failed when the runner refuses it, instead of leaving it queued forever", async () => {
    vi.stubEnv("RUNNER", "route");
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await enqueueRun(RUN);
    await later[0]();
    expect(failStart).toHaveBeenCalledWith(RUN);
  });

  it("route: closes the run as failed when the runner cannot be reached", async () => {
    vi.stubEnv("RUNNER", "route");
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await enqueueRun(RUN);
    await later[0]();
    expect(failStart).toHaveBeenCalledWith(RUN);
  });
});

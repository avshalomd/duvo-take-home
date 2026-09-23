import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Run, RunEvent } from "@/contracts/run";

vi.mock("@/lib/auth/session", () => ({ sessionFromHeaders: vi.fn() }));
vi.mock("@/lib/runs/queries", () => ({ getRun: vi.fn() }));
vi.mock("@/lib/runner/recover", () => ({ sweepIfOverdue: vi.fn() }));

import { sessionFromHeaders } from "@/lib/auth/session";
import { sweepIfOverdue } from "@/lib/runner/recover";
import { getRun } from "@/lib/runs/queries";
import { GET } from "./route";

const RUN_ID = "4f9c1d2e-0000-4000-8000-000000000001";
const run = { id: RUN_ID, prompt: "p", status: "running", model: "m", connectionIds: [], report: null, error: null, numTurns: null, durationMs: null, costUsd: null, createdAt: "2026-09-23T10:00:00.000Z", finishedAt: null } as Run;
const event: RunEvent = { seq: 1, at: "2026-09-23T10:00:00.000Z", kind: "text", payload: { text: "working" } };
const session = { userId: "u", userName: "U", email: "u@example.com", workspaceId: "ws", workspaceName: "W", role: "owner" as const };
const call = (signal?: AbortSignal) => GET(new Request(`http://localhost/api/runs/${RUN_ID}/events`, { signal }), { params: Promise.resolve({ id: RUN_ID }) });

beforeEach(() => {
  vi.mocked(sessionFromHeaders).mockResolvedValue(session);
  vi.mocked(getRun).mockResolvedValue({ run, events: [event], files: [], verdict: null });
  vi.mocked(sweepIfOverdue).mockResolvedValue(false);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/runs/<id>/events", () => {
  it("answers 401 without a session", async () => {
    vi.mocked(sessionFromHeaders).mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it("answers 404 for a run the workspace cannot see", async () => {
    vi.mocked(getRun).mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  // A run whose function Vercel ended stayed "evaluating" on screen: nothing closed it until the next start.
  it("closes a run that has outlived every runner while it is watched, and sends it closed", async () => {
    const stuck = { ...run, status: "evaluating", createdAt: "2026-09-23T09:00:00.000Z" } as Run;
    const closed = { ...stuck, status: "failed", error: "The server stopped while running it" } as Run;
    vi.mocked(getRun)
      .mockResolvedValueOnce({ run: stuck, events: [event], files: [], verdict: null }) // the check before the stream
      .mockResolvedValueOnce({ run: stuck, events: [event], files: [], verdict: null })
      .mockResolvedValue({ run: closed, events: [event], files: [], verdict: null });
    vi.mocked(sweepIfOverdue).mockResolvedValueOnce(true);

    const text = await (await call()).text(); // the stream ends by itself: the run it sent was finished

    expect(sweepIfOverdue).toHaveBeenCalledWith("ws", stuck);
    const message = JSON.parse(text.trim().replace(/^data: /, "").split("\n\ndata: ")[0]);
    expect(message.run.status).toBe("failed");
    expect(message.done).toBe(true);
  });

  it("ends quietly when the client leaves while the stream waits for the next read (Q131)", async () => {
    vi.useFakeTimers();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call();
    const reader = res.body!.getReader();
    await reader.read(); // the first message
    await reader.cancel(); // the client goes away without the request's signal being aborted first
    await vi.advanceTimersByTimeAsync(3000); // the loop wakes up and would read and write again
    expect(errors).not.toHaveBeenCalled();
  });

  it("ends quietly when the request is aborted mid-stream", async () => {
    vi.useFakeTimers();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = new AbortController();
    const res = await call(client.signal);
    const reader = res.body!.getReader();
    await reader.read();
    client.abort();
    await reader.cancel().catch(() => {});
    await vi.advanceTimersByTimeAsync(3000);
    expect(errors).not.toHaveBeenCalled();
  });
});

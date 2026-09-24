import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Run } from "@/contracts/run";

vi.mock("@/lib/auth/session", () => ({ sessionFromHeaders: vi.fn() }));
vi.mock("@/lib/runs/queries", () => ({ getRun: vi.fn() }));
vi.mock("@/lib/runner/recover", () => ({ sweepIfOverdue: vi.fn() }));

import { sessionFromHeaders } from "@/lib/auth/session";
import { sweepIfOverdue } from "@/lib/runner/recover";
import { getRun } from "@/lib/runs/queries";
import { GET } from "./route";

const RUN_ID = "4f9c1d2e-0000-4000-8000-000000000002";
const run = { id: RUN_ID, prompt: "p", status: "running", model: "m", connectionIds: [], report: null, error: null, numTurns: null, durationMs: null, costUsd: null, createdAt: "2026-09-23T10:00:00.000Z", finishedAt: null } as Run;
const session = { userId: "u", userName: "U", email: "u@example.com", workspaceId: "ws", workspaceName: "W", role: "owner" as const };
const call = () => GET(new Request(`http://localhost/api/runs/${RUN_ID}`), { params: Promise.resolve({ id: RUN_ID }) });

beforeEach(() => {
  vi.mocked(sessionFromHeaders).mockResolvedValue(session);
  vi.mocked(getRun).mockReset().mockResolvedValue({ run, events: [], files: [], verdict: null });
  vi.mocked(sweepIfOverdue).mockReset().mockResolvedValue(false);
});

describe("GET /api/runs/<id> (the polling fallback)", () => {
  it("answers the run as it is while it is alive, read once", async () => {
    const body = await (await call()).json();
    expect(body.run.status).toBe("running");
    expect(sweepIfOverdue).toHaveBeenCalledWith("ws", run);
    expect(getRun).toHaveBeenCalledTimes(1);
  });

  // A run whose function Vercel ended stayed "evaluating" on screen: nothing closed it until the next start.
  it("closes a run that has outlived every runner while it is watched, and answers it closed", async () => {
    const closed = { ...run, status: "failed", error: "The server stopped while running it" } as Run;
    vi.mocked(getRun).mockResolvedValueOnce({ run, events: [], files: [], verdict: null }).mockResolvedValue({ run: closed, events: [], files: [], verdict: null });
    vi.mocked(sweepIfOverdue).mockResolvedValueOnce(true);

    const body = await (await call()).json();

    expect(body.run.status).toBe("failed");
    expect(body.state.status).toBe("failed");
  });

  // QA F20: the API answered the machine's own paths (/Users/..., /tmp/... on Vercel), which the page strips (Q187)
  it("answers paths inside the run's folder as the page shows them, and never the machine's folder", async () => {
    const folder = `/Users/someone/projects/handover/runs/${RUN_ID}`;
    const events = [
      { seq: 1, at: "2026-09-23T10:00:00.000Z", kind: "started", payload: { model: "m", tools: [], mcp_servers: [], cwd: folder } },
      { seq: 2, at: "2026-09-23T10:00:01.000Z", kind: "tool_call", payload: { tool_use_id: "t1", name: "Write", input: { file_path: `${folder}/greeting.txt`, content: "Hi" } } },
      { seq: 3, at: "2026-09-23T10:00:02.000Z", kind: "tool_result", payload: { tool_use_id: "t1", content: `The file ${folder}/greeting.txt has been updated`, is_error: false } },
    ] as never;
    vi.mocked(getRun).mockResolvedValue({ run: { ...run, report: `Saved to ${folder}/greeting.txt.` }, events, files: [], verdict: null });

    const res = await call();
    const text = await res.clone().text();
    const body = await res.json();

    expect(text).not.toContain("/Users/someone");
    expect(body.events[1].payload.input.file_path).toBe("greeting.txt");
    expect(body.events[2].payload.content).toBe("The file greeting.txt has been updated");
    expect(body.run.report).toBe("Saved to greeting.txt.");
    expect(body.events[0].payload).not.toHaveProperty("cwd");
  });

  it("answers 404 for a run the workspace cannot see, and sweeps nothing", async () => {
    vi.mocked(getRun).mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(sweepIfOverdue).not.toHaveBeenCalled();
  });
});

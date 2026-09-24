import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  sessionFromHeaders: vi.fn(),
  resolveSession: vi.fn(),
  WORKSPACE_LEFT: "You are no longer in that workspace. Reload the page.",
}));
vi.mock("@/lib/runs/queries", () => ({ listRuns: vi.fn(async () => []) }));
vi.mock("@/lib/runs/start", () => ({ startRun: vi.fn(async () => ({ id: "free-text-run" })) }));
vi.mock("@/lib/automations/store", () => ({ runCommand: vi.fn(async () => ({ id: "command-run" })) }));

import { StartRunInput } from "@/contracts/agent";
import { resolveSession, sessionFromHeaders } from "@/lib/auth/session";
import { runCommand } from "@/lib/automations/store";
import { AutomationError } from "@/lib/automations/errors";
import { RunLimitError } from "@/lib/runs/limits";
import { startRun } from "@/lib/runs/start";
import { POST } from "./route";

const session = { userId: "u", userName: "U", email: "u@example.com", workspaceId: "ws", workspaceName: "W", role: "owner" as const };
const post = (body: string) =>
  POST(new Request("http://localhost/api/runs", { method: "POST", body, headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" } }));
const json = (v: unknown) => post(JSON.stringify(v));

beforeEach(() => {
  vi.mocked(sessionFromHeaders).mockResolvedValue(session);
  vi.mocked(resolveSession).mockResolvedValue({ ctx: session, left: false }); // a start reads whether the workspace was left too
  vi.mocked(startRun).mockClear();
  vi.mocked(runCommand).mockClear();
});

describe("POST /api/runs (Q132)", () => {
  it("answers a body that is not JSON in plain words, and starts nothing", async () => {
    const res = await post("fetch the news please");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Send JSON like {"prompt": "What the agent should do"}' });
    expect(startRun).not.toHaveBeenCalled();
  });

  it("answers JSON without a prompt in the same plain words", async () => {
    for (const body of [{}, { prompt: 42 }, null, ["a"]]) {
      const res = await json(body);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Send JSON like {"prompt": "What the agent should do"}');
    }
  });

  // QA F1: an empty 500 before
  it("refuses a prompt with a NUL byte with 400 and plain words, and starts nothing", async () => {
    const res = await json({ prompt: "Say hello \u0000 world please now" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/hidden character/);
    expect(startRun).not.toHaveBeenCalled();
  });

  it("refuses a short free text with the form's own words", async () => {
    const res = await json({ prompt: "news" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Say what the agent should do");
  });

  it("starts free text through startRun with the caller's address", async () => {
    const res = await json({ prompt: "Fetch the latest AI news into news.csv" });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ id: "free-text-run" });
    expect(vi.mocked(startRun).mock.calls[0][0]).toEqual({ workspaceId: "ws", userId: "u" });
    expect(vi.mocked(startRun).mock.calls[0][1]).toEqual({ prompt: "Fetch the latest AI news into news.csv" });
    expect(vi.mocked(startRun).mock.calls[0][2]).toBe("203.0.113.7");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("runs /audit as the saved automation, never as paid free text", async () => {
    const res = await json({ prompt: "/audit Acme Ltd" });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ id: "command-run" });
    expect(runCommand).toHaveBeenCalledWith({ workspaceId: "ws", userId: "u" }, { command: "audit", input: "Acme Ltd" });
    expect(startRun).not.toHaveBeenCalled();
  });

  it("runs text that starts with a backslash as free text: commands take the front slash only (his call)", async () => {
    const res = await json({ prompt: "\\audit Acme Ltd" });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ id: "free-text-run" });
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("runs a command whose input is shorter than free text may be", async () => {
    expect((await json({ prompt: "/news AI" })).status).toBe(202);
    expect(runCommand).toHaveBeenCalledWith({ workspaceId: "ws", userId: "u" }, { command: "news", input: "AI" });
  });

  it("answers an unknown or unapproved command with the automations' own words, and starts nothing", async () => {
    vi.mocked(runCommand).mockRejectedValueOnce(new AutomationError("There is no automation called /nope. The Automations page lists the ones you have."));
    const res = await json({ prompt: "/nope Acme Ltd" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("There is no automation called /nope. The Automations page lists the ones you have.");
    expect(startRun).not.toHaveBeenCalled();
  });

  it("answers a run limit with 429, for a command as for free text", async () => {
    vi.mocked(runCommand).mockRejectedValueOnce(new RunLimitError("1 run is already working. Wait for it to finish."));
    expect((await json({ prompt: "/audit Acme Ltd" })).status).toBe(429);
    vi.mocked(startRun).mockRejectedValueOnce(new RunLimitError("1 run is already working. Wait for it to finish."));
    expect((await json({ prompt: "Fetch the latest AI news into news.csv" })).status).toBe(429);
  });

  it("answers 401 without a session", async () => {
    vi.mocked(resolveSession).mockResolvedValue(null);
    expect((await json({ prompt: "Fetch the latest AI news" })).status).toBe(401);
  });

  // QA F15: removed from the workspace the session named, the caller's run started in their own workspace unseen
  it("refuses with 409 in plain words when the caller is no longer in the session's workspace, and starts nothing", async () => {
    vi.mocked(resolveSession).mockResolvedValue({ ctx: { ...session, workspaceId: "own-ws" }, left: true });
    const res = await json({ prompt: "Fetch the latest AI news into news.csv" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("You are no longer in that workspace. Reload the page.");
    expect(startRun).not.toHaveBeenCalled();
    expect(runCommand).not.toHaveBeenCalled();
  });

  // Q197: a command whose filled brief was over 4000 characters failed startRun's own validation, and the route
  // answered 500 with an empty body.
  it("answers any validation error with 400 and its plain words, never an empty 500", async () => {
    const tooLong = StartRunInput.safeParse({ prompt: "x".repeat(4001) }).error!;
    vi.mocked(runCommand).mockRejectedValueOnce(tooLong);
    const res = await json({ prompt: `/news-digest ${"x".repeat(1900)}` });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Keep the instructions under 4000 characters" });
  });
});

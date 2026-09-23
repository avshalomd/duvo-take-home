// Review R2: the Home box of a tab that still shows a workspace its user has left (removed while it was open). The
// session falls back to their own workspace, and a run started there would be one they never asked for, in a
// workspace they are not looking at. Session and engine are doubles here: the test reads only the action's rule.
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ left: false }));
const engine = vi.hoisted(() => ({ startRun: vi.fn(async () => ({ id: "run-1" })), runCommand: vi.fn(async () => ({ id: "run-2" })) }));

vi.mock("@/lib/auth/session", () => ({
  requireSession: async () => ({ userId: "u1", userName: "Mia", email: "mia@example.com", workspaceId: "ws-own", workspaceName: "Mia's workspace", role: "owner" }),
  leftWorkspaceRefusal: async () => (session.left ? "You are no longer in that workspace. Reload the page." : null),
}));
vi.mock("@/lib/runs/start", () => ({ startRun: engine.startRun }));
vi.mock("@/lib/automations/store", () => ({ runCommand: engine.runCommand }));
vi.mock("@/lib/eval/reevaluate", () => ({ reevaluateRun: vi.fn() }));
vi.mock("@/lib/runs/cancel", () => ({ cancelRun: vi.fn(), CancelError: class extends Error {} }));
vi.mock("@/lib/runs/follow-up", () => ({ startFollowUp: vi.fn(), FollowUpError: class extends Error {} }));
vi.mock("@/lib/runs/queries", () => ({ getRun: vi.fn() }));
vi.mock("@/lib/runs/run-again", () => ({ startRunAgain: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { startRunAction } from "./actions";

function form(prompt: string): FormData {
  const f = new FormData();
  f.set("prompt", prompt);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  session.left = false;
});

describe("the Home box in a tab that still shows a workspace its user has left", () => {
  it.each(["Write three facts about Acme Ltd", "/audit Acme Ltd"])("starts nothing, and says so in plain words, keeping what was typed (%s)", async (prompt) => {
    session.left = true;
    expect(await startRunAction({}, form(prompt))).toEqual({ error: "You are no longer in that workspace. Reload the page.", values: { prompt } });
    expect(engine.startRun).not.toHaveBeenCalled();
    expect(engine.runCommand).not.toHaveBeenCalled();
  });

  it("starts the run as before once the tab shows a workspace the user is in", async () => {
    expect(await startRunAction({}, form("Write three facts about Acme Ltd"))).toEqual({ startedId: "run-1" });
    expect(engine.startRun).toHaveBeenCalledWith({ workspaceId: "ws-own", userId: "u1" }, { prompt: "Write three facts about Acme Ltd" });
  });
});

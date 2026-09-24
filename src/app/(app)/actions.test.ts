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

import { AutomationError } from "@/lib/automations/errors";
import { reevaluateRun } from "@/lib/eval/reevaluate";
import { getRun } from "@/lib/runs/queries";
import { reevaluateAction, startRunAction } from "./actions";

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

// QA F14: a mistyped command became a paid free-text run
describe("the Home box with a slash and a word no automation can have", () => {
  it.each(["/über test", "/2024-report x", "/audit, Apple"])("hands %j to the command's own refusal, and starts no free-text run", async (prompt) => {
    engine.runCommand.mockRejectedValueOnce(new AutomationError("There's no /x command."));
    expect(await startRunAction({}, form(prompt))).toEqual({ error: "There's no /x command.", values: { prompt } });
    expect(engine.runCommand).toHaveBeenCalledTimes(1);
    expect(engine.startRun).not.toHaveBeenCalled();
  });
});

// QA F19: Check again on a stopped run said "Only a run that has finished can be checked again", yet it had ended
describe("Check again", () => {
  const RUN = "9d1c4f0e-7c1b-4a55-9a3e-2f0b6a1d2c3e";
  const pressed = () => {
    const f = new FormData();
    f.set("runId", RUN);
    return reevaluateAction({}, f);
  };

  it("on a stopped run says there is no result to check, and asks the judge nothing", async () => {
    vi.mocked(getRun).mockResolvedValue({ run: { status: "cancelled" } } as Awaited<ReturnType<typeof getRun>>);
    expect(await pressed()).toEqual({ error: "A stopped run has no result to check." });
    expect(reevaluateRun).not.toHaveBeenCalled();
  });

  it("on a run still working says to wait for it to finish", async () => {
    vi.mocked(getRun).mockResolvedValue({ run: { status: "running" } } as Awaited<ReturnType<typeof getRun>>);
    expect(await pressed()).toEqual({ error: "Only a run that has finished can be checked again" });
    expect(reevaluateRun).not.toHaveBeenCalled();
  });
});

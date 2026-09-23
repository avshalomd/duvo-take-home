// Q178: who may do what with an automation. The session and the store are doubles, so the test reads only the actions'
// own rule: anyone in the workspace drafts, edits, tries and judges; only an owner or an admin approves, turns it off
// or on, deletes it or sets its schedule. The pages hide those controls from members, but anyone can post to an action.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionCtx } from "@/contracts/auth";
import { AutomationError } from "@/lib/automations/errors";

const session = vi.hoisted(() => ({ role: "member" as SessionCtx["role"] }));
const store = vi.hoisted(() => ({
  approveAutomation: vi.fn(async () => ({})),
  deleteAutomation: vi.fn(async () => {}),
  getAutomation: vi.fn(async () => ({ command: "audit", status: "draft", version: 1 })),
  listTrials: vi.fn(async (): Promise<{ version: number; humanVerdict: string | null }[]> => []),
  runCommand: vi.fn(async () => ({ id: "run-1" })),
  setAutomationStatus: vi.fn(async () => {}),
  setHumanVerdict: vi.fn(async () => {}),
  setSchedule: vi.fn(async () => {}),
  startTrial: vi.fn(async () => ({ id: "trial-1" })),
  updateAutomation: vi.fn(async () => ({ version: 1 })),
}));
const draftFromRun = vi.hoisted(() => vi.fn(async () => ({ id: "draft-1" })));
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`); // Next's redirect() throws to end the action; so does this stand-in
  }),
);

vi.mock("@/lib/auth/session", () => ({
  requireSession: async () => ({ userId: "u1", userName: "Sam", email: "sam@example.com", workspaceId: "ws-a", workspaceName: "A", role: session.role }),
}));
vi.mock("@/lib/automations/store", () => store);
vi.mock("@/lib/automations/from-run", () => ({ draftFromRun }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));

import {
  approveAction,
  deleteAutomationAction,
  draftFromRunAction,
  runNowAction,
  saveAutomationAction,
  setScheduleAction,
  setStatusAction,
  setVerdictAction,
  startTrialAction,
} from "./actions";

const ID = "3b368c9a-231d-4fb5-874c-add3059f9c41";
const LOCKED = "Only an owner or an admin can change the command of an approved automation.";
const RUN = "9d1c4f0e-7c1b-4a55-9a3e-2f0b6a1d2c3e";
function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
const schedule = { id: ID, preset: "weekdays", time: "08:00", tz: "Europe/Prague", cron: "", input: "Acme Ltd" };
const edit = {
  id: ID,
  version: "1",
  name: "Company audit",
  command: "audit",
  description: "Audits a company.",
  inputLabel: "Company name",
  instructions: "Write audit.md about {input}.",
  expectedOutputs: "audit.md",
  steps: "Write audit.md",
};

// The four writes only an owner or an admin may make, as a member's browser would post them.
const governed = {
  approve: () => approveAction({}, form({ id: ID })),
  "turn off": () => setStatusAction({}, form({ id: ID, status: "disabled" })),
  "turn on": () => setStatusAction({}, form({ id: ID, status: "active" })),
  delete: () => deleteAutomationAction({}, form({ id: ID })),
  schedule: () => setScheduleAction({}, form(schedule)),
};
const REFUSED: Record<keyof typeof governed, string> = {
  approve: "Only an owner or an admin can approve an automation.",
  "turn off": "Only an owner or an admin can turn an automation off or on.",
  "turn on": "Only an owner or an admin can turn an automation off or on.",
  delete: "Only an owner or an admin can delete an automation.",
  schedule: "Only an owner or an admin can set an automation's schedule.",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a member", () => {
  beforeEach(() => {
    session.role = "member";
  });

  it.each(Object.keys(governed) as (keyof typeof governed)[])("is refused in plain words when they %s, and nothing is written", async (what) => {
    const out = await governed[what]();
    expect(out.error).toBe(REFUSED[what]);
    for (const fn of [store.approveAutomation, store.setAutomationStatus, store.deleteAutomation, store.setSchedule]) expect(fn).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("keeps what they chose in the schedule form when it is refused", async () => {
    const out = await setScheduleAction({}, form(schedule));
    expect(out.values).toMatchObject({ preset: "weekdays", time: "08:00", input: "Acme Ltd" });
  });

  it("drafts an automation from a run", async () => {
    expect(await draftFromRunAction(RUN)).toEqual({ id: "draft-1" });
    expect(draftFromRun).toHaveBeenCalledWith({ workspaceId: "ws-a", userId: "u1" }, RUN);
  });

  it("edits it", async () => {
    expect(await saveAutomationAction({}, form(edit))).toMatchObject({ ok: true, message: "Saved." });
    expect(store.updateAutomation).toHaveBeenCalledWith("ws-a", ID, expect.objectContaining({ name: "Company audit" }), { mayRenameApproved: false });
  });

  it("is told, when an edit makes a new version, that an owner or an admin approves it", async () => {
    store.updateAutomation.mockResolvedValueOnce({ version: 2 });
    const out = await saveAutomationAction({}, form(edit));
    expect(out.message).toBe("Saved. This is version 2 now: run an example of it, then an owner or an admin approves it.");
  });

  it("runs an example and judges it, recorded as their judgment", async () => {
    expect(await startTrialAction({}, form({ id: ID, input: "Acme Ltd" }))).toEqual({ ok: true });
    expect(store.startTrial).toHaveBeenCalledWith({ workspaceId: "ws-a", userId: "u1" }, ID, "Acme Ltd");
    expect(await setVerdictAction({}, form({ automationId: ID, runId: RUN, verdict: "approved" }))).toEqual({ ok: true });
    // who judged comes from the session, never from the form
    expect(store.setHumanVerdict).toHaveBeenCalledWith({ workspaceId: "ws-a", userId: "u1" }, { runId: RUN, verdict: "approved", note: undefined });
  });

  it("renames a draft's command, telling the store it may not rename an approved one", async () => {
    store.getAutomation.mockResolvedValueOnce({ command: "audit", status: "draft", version: 1 });
    expect(await saveAutomationAction({}, form({ ...edit, command: "audit-2" }))).toMatchObject({ ok: true });
    expect(store.updateAutomation).toHaveBeenCalledWith("ws-a", ID, expect.objectContaining({ command: "audit-2" }), { mayRenameApproved: false });
  });

  // Review R2: an owner approving between the page's read and the save; the store's write refuses, and says why
  it("is refused in plain words when the automation was approved while they renamed it, keeping what they typed", async () => {
    store.getAutomation.mockResolvedValueOnce({ command: "audit", status: "draft", version: 1 });
    store.updateAutomation.mockRejectedValueOnce(new AutomationError(LOCKED));
    const out = await saveAutomationAction({}, form({ ...edit, command: "audit-2" }));
    expect(out).toMatchObject({ error: LOCKED, values: { command: "audit-2" } });
  });

  // Review R2: an edit of a Ready one's instructions sends it back to draft; its command stays theirs to leave alone
  it("is refused renaming the command of a draft that was approved before, and nothing is written", async () => {
    store.getAutomation.mockResolvedValueOnce({ command: "audit", status: "draft", version: 2 });
    store.listTrials.mockResolvedValueOnce([{ version: 1, humanVerdict: "approved" }]);
    const out = await saveAutomationAction({}, form({ ...edit, command: "audit-2" }));
    expect(out.error).toBe(LOCKED);
    expect(store.updateAutomation).not.toHaveBeenCalled();
  });

  it.each(["active", "disabled"] as const)("is refused renaming an approved automation's command (%s), and nothing is written", async (status) => {
    store.getAutomation.mockResolvedValueOnce({ command: "audit", status, version: 1 });
    const out = await saveAutomationAction({}, form({ ...edit, command: "audit-2" }));
    expect(out.error).toBe(LOCKED);
    expect(out.values).toMatchObject({ command: "audit-2", name: "Company audit" }); // what was typed stays
    expect(store.updateAutomation).not.toHaveBeenCalled();
  });

  it("still edits the rest of an approved automation when the command stays", async () => {
    store.getAutomation.mockResolvedValueOnce({ command: "audit", status: "active", version: 1 });
    expect(await saveAutomationAction({}, form({ ...edit, command: "/Audit" }))).toMatchObject({ ok: true }); // the same command, as typed
    expect(store.updateAutomation).toHaveBeenCalled();
  });

  it("runs a ready automation, which is what approving it was for", async () => {
    await expect(runNowAction({}, form({ id: ID, input: "Acme Ltd" }))).rejects.toThrow("NEXT_REDIRECT /?run=run-1");
    expect(store.runCommand).toHaveBeenCalledWith({ workspaceId: "ws-a", userId: "u1" }, { command: "audit", input: "Acme Ltd" });
  });
});

describe.each(["owner", "admin"] as const)("an %s", (role) => {
  beforeEach(() => {
    session.role = role;
  });

  it("approves, and lands on the ready page", async () => {
    await expect(governed.approve()).rejects.toThrow(`NEXT_REDIRECT /automations/${ID}?approved=1`);
    expect(store.approveAutomation).toHaveBeenCalledWith("ws-a", ID);
  });

  it("turns it off and on", async () => {
    expect(await governed["turn off"]()).toEqual({ ok: true });
    expect(await governed["turn on"]()).toEqual({ ok: true });
    expect(store.setAutomationStatus).toHaveBeenNthCalledWith(1, "ws-a", ID, "disabled");
    expect(store.setAutomationStatus).toHaveBeenNthCalledWith(2, "ws-a", ID, "active");
  });

  it("sets a schedule", async () => {
    expect(await governed.schedule()).toEqual({ ok: true, message: "Schedule saved." });
    expect(store.setSchedule).toHaveBeenCalledWith("ws-a", ID, "0 8 * * 1-5", "Acme Ltd", "Europe/Prague");
  });

  it("deletes it and goes back to the gallery", async () => {
    await expect(governed.delete()).rejects.toThrow("NEXT_REDIRECT /automations");
    expect(store.deleteAutomation).toHaveBeenCalledWith("ws-a", ID);
  });

  it("renames an approved automation's command", async () => {
    store.getAutomation.mockResolvedValueOnce({ command: "audit", status: "active", version: 1 });
    expect(await saveAutomationAction({}, form({ ...edit, command: "audit-2" }))).toMatchObject({ ok: true });
    expect(store.updateAutomation).toHaveBeenCalledWith("ws-a", ID, expect.objectContaining({ command: "audit-2" }), { mayRenameApproved: true });
  });

  it("is told, when an edit makes a new version, to run an example before approving", async () => {
    store.updateAutomation.mockResolvedValueOnce({ version: 2 });
    const out = await saveAutomationAction({}, form(edit));
    expect(out.message).toBe("Saved. This is version 2 now: run an example of it before you approve.");
  });
});

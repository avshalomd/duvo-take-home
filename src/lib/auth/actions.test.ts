// Switching workspaces. Better Auth checks membership too, but answers a stranger's workspace with a thrown error,
// which reached the browser as a 500 (security QA). Session, members and Better Auth are doubles here.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  setActive: vi.fn(async () => ({})),
  createOrganization: vi.fn(async () => ({ id: "ws-new" })),
  acceptInvitation: vi.fn(async () => ({})),
  limitRefusal: vi.fn(async (): Promise<string | null> => null),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`); // Next's redirect() throws to end the action; so does this stand-in
  }),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("./auth", () => ({
  auth: { api: { setActiveOrganization: h.setActive, createOrganization: h.createOrganization, acceptInvitation: h.acceptInvitation } },
}));
vi.mock("./session", () => ({
  requireSession: async () => ({ userId: "u1", userName: "Sam", email: "sam@example.com", workspaceId: "ws-a", workspaceName: "A", role: "owner" }),
}));
vi.mock("./workspace-limit", () => ({ workspaceLimitRefusal: h.limitRefusal }));
vi.mock("./members", () => ({
  listWorkspaces: async () => [
    { id: "ws-a", name: "Sam's workspace", role: "owner" },
    { id: "ws-b", name: "Finance", role: "member" },
  ],
  revokeInvitation: vi.fn(),
}));

import { acceptInvitation, createWorkspace, revokeInvitationAction, trySwitchWorkspace } from "./actions";
import { revokeInvitation } from "./members";

const NOT_YOURS = "You are not a member of that workspace, so it cannot be opened.";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("switching to a workspace the user is not in", () => {
  it("is refused in plain words, and Better Auth is never asked", async () => {
    expect(await trySwitchWorkspace("ws-someone-elses")).toEqual({ error: NOT_YOURS });
    expect(h.setActive).not.toHaveBeenCalled();
    expect(h.redirect).not.toHaveBeenCalled();
  });
});

describe("switching to one of the user's workspaces", () => {
  it("makes it the active one and opens Home", async () => {
    await expect(trySwitchWorkspace("ws-b")).rejects.toThrow("NEXT_REDIRECT /");
    expect(h.setActive).toHaveBeenCalledWith({ headers: expect.any(Headers), body: { organizationId: "ws-b" } });
  });
});

// QA F16: forged calls with an empty, a 200-character or a non-string id threw (a 500 error page)
describe("revoking and accepting an invitation by a forged id", () => {
  it.each([[""], ["a".repeat(200)], [5], [null]])("revoking %j is refused in plain words, and nothing is asked", async (id) => {
    expect(await revokeInvitationAction(id as string)).toEqual({ error: "That invitation is no longer pending." });
    expect(revokeInvitation).not.toHaveBeenCalled();
  });

  it.each([[""], ["a".repeat(200)], [5], [{ id: "x" }]])("accepting %j is refused in plain words, and Better Auth is never asked", async (id) => {
    expect(await acceptInvitation(id as string)).toEqual({ error: "This invitation has expired or was already used. Ask for a new link." });
    expect(h.acceptInvitation).not.toHaveBeenCalled();
  });
});

// QA F1: a NUL byte in the name reached Postgres, which refused it with a 500
describe("making a workspace", () => {
  // Security review S1, his call: a few workspaces per person, each one having a budget of its own
  it("is refused in plain words to a person who owns the most workspaces one can, keeping the name typed", async () => {
    h.limitRefusal.mockResolvedValueOnce("You already own 5 workspaces, the most one person can have.");
    const form = new FormData();
    form.set("name", "Finance");
    expect(await createWorkspace({}, form)).toEqual({ error: "You already own 5 workspaces, the most one person can have.", name: "Finance" });
    expect(h.limitRefusal).toHaveBeenCalledWith("u1");
    expect(h.createOrganization).not.toHaveBeenCalled();
  });

  it("refuses a name with a hidden NUL character in plain words, and Better Auth is never asked", async () => {
    const form = new FormData();
    form.set("name", "[e2e] nul \u0000 ws");
    const state = await createWorkspace({}, form);
    expect(state.error).toMatch(/hidden character/);
    expect(h.createOrganization).not.toHaveBeenCalled();
  });
});

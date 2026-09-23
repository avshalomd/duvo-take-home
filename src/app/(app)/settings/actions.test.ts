// Q80: who may change a workspace's connections. The session and the store are doubles, so the test reads only the
// actions' own rule: owners and admins change connections, members only see them.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionCtx } from "@/contracts/auth";

const session = vi.hoisted(() => ({ role: "member" as SessionCtx["role"], left: false }));
const store = vi.hoisted(() => ({
  addConnection: vi.fn(async () => ({})),
  updateConnection: vi.fn(async () => ({})),
  deleteConnection: vi.fn(async () => {}),
  setConnectionEnabled: vi.fn(async () => {}),
}));

vi.mock("@/lib/auth/session", () => ({
  requireSession: async () => ({ userId: "u1", userName: "Sam", email: "sam@example.com", workspaceId: "ws-a", workspaceName: "A", role: session.role }),
  // the tab still shows a workspace its user has left; requireSession has fallen back to their own ("ws-a" here)
  leftWorkspaceRefusal: async () => (session.left ? "You are no longer in that workspace. Reload the page." : null),
}));
vi.mock("@/lib/connections/store", () => ({
  ...store,
  ConnectionNotFoundError: class extends Error {
    message = "That connection could not be found. It may have been deleted - reload the page.";
  },
  ConnectionNameTakenError: class extends Error {},
  PrivateAddressError: class extends Error {
    message = "That address points at a private or local network, which a connection cannot reach";
  },
}));
const members = vi.hoisted(() => ({ removeFromWorkspace: vi.fn(async () => {}), changeMemberRole: vi.fn(async () => {}) }));
vi.mock("@/lib/auth/members", () => ({ inviteMember: vi.fn(), listMembers: vi.fn(async () => []), ...members }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "better-auth.session_token=t" }) }));
vi.mock("@/lib/usage/budget", () => ({ updateLimits: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { MemberChangeError } from "@/lib/auth/member-rules";
import { inviteMember } from "@/lib/auth/members";
import { updateLimits } from "@/lib/usage/budget";
import {
  addConnectionAction,
  changeMemberRoleAction,
  deleteConnectionAction,
  inviteMemberAction,
  removeMemberAction,
  setConnectionEnabledAction,
  updateConnectionAction,
  updateLimitsAction,
} from "./actions";

const ID = "3b368c9a-231d-4fb5-874c-add3059f9c41";
function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
const server = { name: "GitHub", url: "https://attacker.example/mcp", transport: "http", authType: "bearer" };
const READ_ONLY = "Only an owner or an admin can change the connections.";

// Every write the Connections page can make, as a member would send it.
const writes = {
  add: () => addConnectionAction({}, form({ ...server, token: "t" })),
  edit: () => updateConnectionAction({}, form({ ...server, id: ID })),
  delete: () => deleteConnectionAction(ID),
  toggle: () => setConnectionEnabledAction(ID, false),
};

beforeEach(() => {
  vi.clearAllMocks();
  session.left = false;
});

describe("the connection actions for a member", () => {
  it.each(Object.keys(writes) as (keyof typeof writes)[])("refuse to %s a connection and leave the store untouched", async (what) => {
    session.role = "member";
    expect(await writes[what]()).toEqual({ error: READ_ONLY });
    for (const fn of Object.values(store)) expect(fn).not.toHaveBeenCalled();
  });
});

describe("the connection actions for an owner or an admin", () => {
  it.each(["owner", "admin"] as const)("let an %s edit, delete and toggle", async (role) => {
    session.role = role;
    expect(await writes.edit()).toEqual({});
    expect(await writes.delete()).toEqual({});
    expect(await writes.toggle()).toEqual({});
    expect(store.updateConnection).toHaveBeenCalledWith("ws-a", ID, expect.objectContaining({ url: "https://attacker.example/mcp" }));
    expect(store.deleteConnection).toHaveBeenCalledWith("ws-a", ID);
    expect(store.setConnectionEnabled).toHaveBeenCalledWith("ws-a", ID, false);
  });

  it.each(["add", "edit"] as const)("show a name another server already has as a problem with the Name field (%s)", async (what) => {
    session.role = "owner";
    const { ConnectionNameTakenError } = await import("@/lib/connections/store");
    const taken = new ConnectionNameTakenError("That name is already used by QA Bearer");
    (what === "add" ? store.addConnection : store.updateConnection).mockRejectedValueOnce(taken); // only the one this case calls: a queued once would leak into the next test
    const out = await writes[what]();
    expect(out.fieldErrors?.name).toEqual(["That name is already used by QA Bearer"]);
    expect(out.values).toMatchObject({ name: "GitHub" }); // what was typed stays, to be changed
  });

  it("lets an owner add a server", async () => {
    session.role = "owner";
    expect(await writes.add()).toEqual({});
    expect(store.addConnection).toHaveBeenCalledOnce();
  });
});

// Security QA: a public-looking name can resolve inside our network. The store looks the host up before it saves;
// the form then shows its sentence beside the Address field, as it does for a private address typed as numbers.
describe("a connection address that resolves to a private network", () => {
  it.each(["add", "edit"] as const)("is shown beside the Address field, with what was typed kept (%s)", async (what) => {
    session.role = "owner";
    const { PrivateAddressError } = await import("@/lib/connections/store");
    (what === "add" ? store.addConnection : store.updateConnection).mockRejectedValueOnce(new PrivateAddressError());
    const out = await writes[what]();
    expect(out.fieldErrors?.url).toEqual(["That address points at a private or local network, which a connection cannot reach"]);
    expect(out.values).toMatchObject({ url: "https://attacker.example/mcp" });
  });
});

// Security QA: another workspace's id (or one deleted meanwhile) used to answer {} while nothing changed.
describe("toggling or deleting a connection that is not this workspace's", () => {
  it.each(["delete", "toggle"] as const)("says it was not found instead of reporting success (%s)", async (what) => {
    session.role = "owner";
    const { ConnectionNotFoundError } = await import("@/lib/connections/store");
    (what === "delete" ? store.deleteConnection : store.setConnectionEnabled).mockRejectedValueOnce(new ConnectionNotFoundError());
    expect(await writes[what]()).toEqual({ error: "That connection could not be found. It may have been deleted - reload the page." });
  });
});

// Q169: removing someone and changing a role. The rules themselves are lib/auth/member-rules.ts's (and its tests');
// here, what the actions do before and after: the member id and the role are checked like any other input, and the
// workspace is the session's, never one the browser names.
describe("removing someone and changing a role", () => {
  const MEMBER = "mem_3b368c9a";
  const NOT_FOUND = "That person could not be found in this workspace. Reload the page to see who is in it.";

  it("refuse a plain member before anything is looked up", async () => {
    session.role = "member";
    expect(await removeMemberAction(MEMBER)).toEqual({ error: "Only an owner or an admin can remove people from this workspace." });
    expect(await changeMemberRoleAction(MEMBER, "admin")).toEqual({ error: "Only an owner or an admin can change someone's role." });
    for (const fn of Object.values(members)) expect(fn).not.toHaveBeenCalled();
  });

  it("pass the session's workspace and the asker's headers on, with the member id as it came", async () => {
    session.role = "admin";
    expect(await removeMemberAction(MEMBER)).toEqual({});
    expect(await changeMemberRoleAction(MEMBER, "admin")).toEqual({});
    const ctx = expect.objectContaining({ userId: "u1", workspaceId: "ws-a", role: "admin" });
    expect(members.removeFromWorkspace).toHaveBeenCalledWith(expect.any(Headers), ctx, MEMBER);
    expect(members.changeMemberRole).toHaveBeenCalledWith(expect.any(Headers), ctx, MEMBER, "admin");
  });

  it("refuse a role the app does not have", async () => {
    session.role = "owner";
    expect(await changeMemberRoleAction(MEMBER, "superuser")).toEqual({ error: "Choose Member, Admin or Owner." });
    expect(members.changeMemberRole).not.toHaveBeenCalled();
  });

  // "@" would make Better Auth look the member up by email instead of by id
  it.each(["", "x".repeat(101), "someone@example.com", "id with spaces"])("answer an id that cannot be a member's as not found (%j)", async (id) => {
    session.role = "owner";
    expect(await removeMemberAction(id)).toEqual({ error: NOT_FOUND });
    expect(await changeMemberRoleAction(id, "admin")).toEqual({ error: NOT_FOUND });
    for (const fn of Object.values(members)) expect(fn).not.toHaveBeenCalled();
  });

  it("say a refusal of the rules in its own words", async () => {
    session.role = "admin";
    members.removeFromWorkspace.mockRejectedValueOnce(new MemberChangeError("Only an owner can remove an owner."));
    expect(await removeMemberAction(MEMBER)).toEqual({ error: "Only an owner can remove an owner." });
  });

  it("answer anything unexpected with one safe sentence, never the error's own text", async () => {
    session.role = "owner";
    vi.spyOn(console, "error").mockImplementation(() => {}); // readable() logs it for us
    members.changeMemberRole.mockRejectedValueOnce(new Error("connect ECONNREFUSED db.internal:5432"));
    expect(await changeMemberRoleAction(MEMBER, "member")).toEqual({ error: "Something went wrong on our side - try again" });
  });
});

// Review R2: someone removed while their tab was open. The session falls back to their own workspace, and a write that
// names no record - an invitation, a connection, the limits - landed there unseen. Refused instead, in words.
describe("a tab that still shows a workspace its user has left", () => {
  const LEFT = "You are no longer in that workspace. Reload the page.";
  const idless = {
    "create an invite link": () => inviteMemberAction({}, form({ email: "guest@example.com", role: "member" })),
    "add a connection": () => addConnectionAction({}, form({ ...server, token: "t" })),
    "change the limits": () => updateLimitsAction({}, form({ dailyBudgetUsd: "5", dailyRunLimit: "30", maxInFlight: "3" })),
  };

  it.each(Object.keys(idless) as (keyof typeof idless)[])("refuses to %s in plain words, and writes nothing to their own workspace", async (what) => {
    session.role = "owner"; // they own their own workspace, which the session fell back to
    session.left = true;
    expect(await idless[what]()).toMatchObject({ error: LEFT });
    expect(inviteMember).not.toHaveBeenCalled();
    expect(store.addConnection).not.toHaveBeenCalled();
    expect(updateLimits).not.toHaveBeenCalled();
  });
});

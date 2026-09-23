// Q80: who may change a workspace's connections. The session and the store are doubles, so the test reads only the
// actions' own rule: owners and admins change connections, members only see them.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionCtx } from "@/contracts/auth";

const session = vi.hoisted(() => ({ role: "member" as SessionCtx["role"] }));
const store = vi.hoisted(() => ({
  addConnection: vi.fn(async () => ({})),
  updateConnection: vi.fn(async () => ({})),
  deleteConnection: vi.fn(async () => {}),
  setConnectionEnabled: vi.fn(async () => {}),
}));

vi.mock("@/lib/auth/session", () => ({
  requireSession: async () => ({ userId: "u1", userName: "Sam", email: "sam@example.com", workspaceId: "ws-a", workspaceName: "A", role: session.role }),
}));
vi.mock("@/lib/connections/store", () => ({
  ...store,
  ConnectionNotFoundError: class extends Error {},
  ConnectionNameTakenError: class extends Error {},
  PrivateAddressError: class extends Error {},
}));
vi.mock("@/lib/auth/members", () => ({ inviteMember: vi.fn(), listMembers: vi.fn(async () => []) }));
vi.mock("@/lib/usage/budget", () => ({ updateLimits: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addConnectionAction, deleteConnectionAction, setConnectionEnabledAction, updateConnectionAction } from "./actions";

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
    const refused = new PrivateAddressError("That address points at a private or local network, which a connection cannot reach");
    (what === "add" ? store.addConnection : store.updateConnection).mockRejectedValueOnce(refused);
    const out = await writes[what]();
    expect(out.fieldErrors?.url).toEqual(["That address points at a private or local network, which a connection cannot reach"]);
    expect(out.values).toMatchObject({ url: "https://attacker.example/mcp" });
  });
});

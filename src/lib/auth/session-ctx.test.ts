import { describe, expect, it } from "vitest";
import { pickMembership, toRole, toSessionCtx, type Membership } from "./session-ctx";

const user = { id: "u1", name: "Avshalom Dayan", email: "a@example.com" };
const personal: Membership = { workspaceId: "ws-personal", workspaceName: "Avshalom's workspace", role: "owner", joinedAt: new Date("2026-09-01") };
const team: Membership = { workspaceId: "ws-team", workspaceName: "Acme", role: "member", joinedAt: new Date("2026-09-10") };

describe("toSessionCtx", () => {
  it("maps the user and the chosen membership to the session every server read uses", () => {
    expect(toSessionCtx(user, personal)).toEqual({
      userId: "u1",
      userName: "Avshalom Dayan",
      email: "a@example.com",
      workspaceId: "ws-personal",
      workspaceName: "Avshalom's workspace",
      role: "owner",
    });
  });

  it("uses the email as the name when the account has no name", () => {
    expect(toSessionCtx({ ...user, name: "  " }, personal).userName).toBe("a@example.com");
  });
});

describe("pickMembership", () => {
  it("picks the active workspace when the user is a member of it", () => {
    expect(pickMembership([personal, team], "ws-team")).toBe(team);
  });

  it("falls back to the earliest membership when no workspace is active", () => {
    expect(pickMembership([team, personal], null)).toBe(personal);
  });

  it("falls back to the earliest membership when the active workspace is one the user no longer belongs to", () => {
    expect(pickMembership([team, personal], "ws-gone")).toBe(personal);
  });

  it("answers null when the user belongs to no workspace", () => {
    expect(pickMembership([], "ws-team")).toBeNull();
  });
});

describe("toRole", () => {
  it("keeps the three roles as they are", () => {
    expect(toRole("owner")).toBe("owner");
    expect(toRole("admin")).toBe("admin");
    expect(toRole("member")).toBe("member");
  });

  it("reads the highest of several comma-separated roles", () => {
    expect(toRole("member,admin")).toBe("admin");
    expect(toRole("admin, owner")).toBe("owner");
  });

  it("reads an unknown role as member, the least privilege", () => {
    expect(toRole("superuser")).toBe("member");
    expect(toRole("")).toBe("member");
  });
});

// Q169: who may remove whom from a workspace, and who may change whose role. Pure: the people are plain objects
// and the owners are a count, so every rule is read here without a database or Better Auth.
import { describe, expect, it } from "vitest";
import { removalRefusal, roleChangeRefusal, type Person } from "./member-rules";

const owner: Person = { userId: "u-owner", role: "owner" };
const otherOwner: Person = { userId: "u-owner-2", role: "owner" };
const admin: Person = { userId: "u-admin", role: "admin" };
const otherAdmin: Person = { userId: "u-admin-2", role: "admin" };
const plain: Person = { userId: "u-member", role: "member" };
const otherPlain: Person = { userId: "u-member-2", role: "member" };

describe("removing someone from the workspace", () => {
  it("lets an owner remove a member, an admin, or another owner while one owner stays", () => {
    expect(removalRefusal(owner, plain, 1)).toBeNull();
    expect(removalRefusal(owner, admin, 1)).toBeNull();
    expect(removalRefusal(owner, otherOwner, 2)).toBeNull();
  });

  it("lets an admin remove a member or another admin", () => {
    expect(removalRefusal(admin, plain, 1)).toBeNull();
    expect(removalRefusal(admin, otherAdmin, 1)).toBeNull();
  });

  it("refuses an admin who tries to remove an owner", () => {
    expect(removalRefusal(admin, owner, 2)).toBe("Only an owner can remove an owner.");
  });

  it("refuses a plain member, whoever they try to remove", () => {
    for (const target of [otherPlain, admin, owner]) {
      expect(removalRefusal(plain, target, 1)).toBe("Only an owner or an admin can remove people from this workspace.");
    }
  });

  it("refuses to remove yourself here, owner or admin (leaving is another action)", () => {
    expect(removalRefusal(owner, owner, 2)).toBe("You cannot remove yourself here.");
    expect(removalRefusal(admin, admin, 1)).toBe("You cannot remove yourself here.");
  });

  it("never removes the last owner", () => {
    expect(removalRefusal(otherOwner, owner, 1)).toBe("A workspace needs an owner. Make someone else an owner first.");
  });
});

describe("changing someone's role", () => {
  it("lets an owner make a member an admin or an owner, and an admin a member again", () => {
    expect(roleChangeRefusal(owner, plain, "admin", 1)).toBeNull();
    expect(roleChangeRefusal(owner, plain, "owner", 1)).toBeNull();
    expect(roleChangeRefusal(owner, admin, "member", 1)).toBeNull();
  });

  it("lets an owner make another owner an admin while one owner stays", () => {
    expect(roleChangeRefusal(owner, otherOwner, "admin", 2)).toBeNull();
  });

  it("lets an admin move people between member and admin", () => {
    expect(roleChangeRefusal(admin, plain, "admin", 1)).toBeNull();
    expect(roleChangeRefusal(admin, otherAdmin, "member", 1)).toBeNull();
  });

  it("refuses an admin who tries to change an owner's role", () => {
    expect(roleChangeRefusal(admin, owner, "member", 2)).toBe("Only an owner can change an owner's role.");
  });

  it("refuses an admin who tries to make anyone an owner", () => {
    expect(roleChangeRefusal(admin, plain, "owner", 1)).toBe("Only an owner can make someone an owner.");
    expect(roleChangeRefusal(admin, otherAdmin, "owner", 1)).toBe("Only an owner can make someone an owner.");
  });

  it("refuses a plain member, whatever they try", () => {
    expect(roleChangeRefusal(plain, otherPlain, "admin", 1)).toBe("Only an owner or an admin can change someone's role.");
    expect(roleChangeRefusal(plain, plain, "owner", 1)).toBe("Only an owner or an admin can change someone's role.");
  });

  it("refuses to change your own role here", () => {
    expect(roleChangeRefusal(admin, admin, "member", 1)).toBe("You cannot change your own role here.");
    expect(roleChangeRefusal(owner, owner, "admin", 2)).toBe("You cannot change your own role here.");
  });

  it("never demotes the last owner", () => {
    expect(roleChangeRefusal(otherOwner, owner, "admin", 1)).toBe("A workspace needs an owner. Make someone else an owner first.");
  });
});

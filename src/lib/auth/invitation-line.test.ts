import { describe, expect, it } from "vitest";
import { invitationLine } from "./invitation-line";

const NOW = new Date("2026-09-23T12:00:00Z");
const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

describe("invitationLine", () => {
  it("says the role and how long the link still works, in whole days when there is more than a day", () => {
    expect(invitationLine("member", inHours(48), NOW)).toBe("Invited as a member. The link works for 2 more days.");
    expect(invitationLine("member", inHours(47), NOW)).toBe("Invited as a member. The link works for 1 more day.");
  });

  it("counts hours on the last day", () => {
    expect(invitationLine("admin", inHours(5.5), NOW)).toBe("Invited as an admin. The link works for 5 more hours.");
    expect(invitationLine("admin", inHours(1.2), NOW)).toBe("Invited as an admin. The link works for 1 more hour.");
  });

  it("says less than an hour at the end, and that it has expired after", () => {
    expect(invitationLine("member", inHours(0.3), NOW)).toBe("Invited as a member. The link works for less than an hour.");
    expect(invitationLine("member", inHours(-1), NOW)).toBe("Invited as a member. The link has expired.");
  });

  it("reads an unknown role as a member, as the session does", () => {
    expect(invitationLine("owner,admin", inHours(30), NOW)).toBe("Invited as an owner. The link works for 1 more day.");
    expect(invitationLine("", inHours(30), NOW)).toBe("Invited as a member. The link works for 1 more day.");
  });
});

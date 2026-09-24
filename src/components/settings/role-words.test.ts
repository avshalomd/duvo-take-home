import { describe, expect, it } from "vitest";
import { INVITE_HELP, ROLE_MEANS } from "./role-words";

// UX QA U12: the invite's helper said an admin "can also change settings and invite people"; the role menu said an
// admin "also approves automations and manages settings and people"
describe("the words for the roles", () => {
  it("are the same in the invite's helper as in the role menu", () => {
    expect(INVITE_HELP).toBe(
      "You get a link to send them. A member runs tasks, builds automations and tries them; an admin also approves automations and manages settings and people.",
    );
    expect(INVITE_HELP).toContain(ROLE_MEANS.member.toLowerCase());
    expect(INVITE_HELP).toContain(ROLE_MEANS.admin.toLowerCase());
  });
});

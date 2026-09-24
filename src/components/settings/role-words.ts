import type { SessionCtx } from "@/contracts/auth";

type Role = SessionCtx["role"];

// What each role may do, short enough for one line on a phone, so the choice is made knowing what it gives. One set
// of words for the role menu and the invite's helper (UX QA U12: they described an admin differently).
export const ROLE_MEANS: Record<Role, string> = {
  member: "Runs tasks, builds automations and tries them",
  admin: "Also approves automations and manages settings and people", // Q178: approving is theirs, not a member's
  owner: "Can also make and remove owners",
};

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** The line above the invite form: an invitation is a link, and the two roles it can give, in the menu's words. */
export const INVITE_HELP = `You get a link to send them. A member ${lower(ROLE_MEANS.member)}; an admin ${lower(ROLE_MEANS.admin)}.`;

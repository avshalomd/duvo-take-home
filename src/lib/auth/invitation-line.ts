import { toRole } from "./session-ctx";

// Pure: the one line under a pending invitation's email, in words (no "member · 2 days" meta strings).

const HOUR = 3_600_000;

const ARTICLE = { owner: "an owner", admin: "an admin", member: "a member" } as const;

/** "Invited as a member. The link works for 2 more days." */
export function invitationLine(role: string, expiresAt: Date, now: Date): string {
  const who = `Invited as ${ARTICLE[toRole(role)]}.`;
  const left = expiresAt.getTime() - now.getTime();
  if (left <= 0) return `${who} The link has expired.`;
  return `${who} The link works for ${timeLeft(left)}.`;
}

// Whole units, rounded down: "1 more day" at 47 hours never promises more time than there is.
function timeLeft(ms: number): string {
  const hours = Math.floor(ms / HOUR);
  const days = Math.floor(hours / 24);
  if (days >= 2) return `${days} more days`;
  if (days === 1) return "1 more day";
  if (hours >= 2) return `${hours} more hours`;
  if (hours === 1) return "1 more hour";
  return "less than an hour";
}

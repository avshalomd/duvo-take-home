import { getSessionInfo } from "@anthropic-ai/claude-agent-sdk";

/** The SDK session id, read from the init message; null for every other message. */
export function sessionIdOf(message: unknown): string | null {
  if (!message || typeof message !== "object") return null;
  const m = message as { type?: unknown; subtype?: unknown; session_id?: unknown };
  if (m.type !== "system" || m.subtype !== "init") return null; // results carry it too, but init is the one that names the run's session
  return typeof m.session_id === "string" && m.session_id ? m.session_id : null;
}

/**
 * How a follow-up continues its parent's conversation. Spiked 2026-09-23 with SDK 0.3.278: `resume` + `forkSession`
 * found a session recorded under another working directory (even a deleted one), because the CLI looks the id up
 * across ~/.claude/projects/, so no SessionStore is needed while the session file is on this machine.
 * `getSessionInfo` checks that first (a few ms, no model call): where the file is gone - Vercel's per-instance
 * /tmp, a worker on another machine - the follow-up starts a fresh session and the carry-over prompt does the work.
 * forkSession: the parent's session stays as it was, so two follow-ups of one run never write into the same one.
 */
export async function resumeOptions(parentSessionId: string | null): Promise<{ resume: string; forkSession: true } | null> {
  if (!parentSessionId) return null;
  const found = await getSessionInfo(parentSessionId).catch(() => undefined);
  return found ? { resume: parentSessionId, forkSession: true } : null;
}

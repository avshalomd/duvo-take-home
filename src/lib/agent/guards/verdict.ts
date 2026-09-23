import type { SyncHookJSONOutput } from "@anthropic-ai/claude-agent-sdk";
import type { GuardRecord } from "@/contracts/guard";

/** What one guard concludes about one tool call. The hook adds the guard's name and the tool before recording it. */
export type Verdict = Pick<GuardRecord, "decision" | "reason" | "target">;

/** One guard: a tool call in, a verdict out. Only the url guard is async, because it may ask Jev. */
export type Check = (tool: string, input: unknown) => Verdict | Promise<Verdict>;

export const allowed = (reason: string): Verdict => ({ decision: "allowed", reason });

/**
 * The SDK's PreToolUse answer, the shape v1's path guard proved on a live run. Only "blocked" stops the call;
 * "flagged" and "unchecked" let it through and are recorded. The reason reaches the agent on a denial, so it is
 * written as what to do instead.
 */
export function toHookOutput(v: Verdict): SyncHookJSONOutput {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: v.decision === "blocked" ? "deny" : "allow",
      permissionDecisionReason: v.reason,
    },
  };
}

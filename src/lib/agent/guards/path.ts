import { pathArg, pathGuard } from "../guard";
import { allowed, type Verdict } from "./verdict";

/** v1's path guard (../guard.ts, unchanged) as a v2 guard: its denial becomes a "blocked" verdict naming the path the agent asked for. */
export function pathCheck(dir: string) {
  const guard = pathGuard(dir);
  return (tool: string, input: unknown): Verdict => {
    const out = guard({ tool_name: tool, tool_input: input }).hookSpecificOutput;
    if (out.permissionDecision === "allow") return allowed(out.permissionDecisionReason);
    // The target is the path as the agent wrote it ("../../.env.local"); the reason says where it resolves.
    return { decision: "blocked", reason: out.permissionDecisionReason, target: pathArg(input) ?? undefined };
  };
}

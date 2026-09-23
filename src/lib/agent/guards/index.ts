import type { HookCallback, PreToolUseHookInput } from "@anthropic-ai/claude-agent-sdk";
import type { BuildGuardHooks, GuardContext, GuardName } from "@/contracts/guard";
import { connectionCheck } from "./connection";
import { pathCheck } from "./path";
import { urlCheck } from "./url";
import { allowed, toHookOutput, type Check, type Verdict } from "./verdict";
import { writeCheck } from "./write";

/**
 * Every guard as the SDK's PreToolUse hooks. One hook per tool, running that tool's guards in a fixed order and
 * stopping at the first block: the order is ours to state (on Write the path is checked before the content), not
 * left to how the CLI merges the answers of several hooks. Every decision that is not "allowed" is recorded as a
 * guard event; allowed ones are not, to keep the timeline quiet.
 */
export const buildGuardHooks: BuildGuardHooks = (ctx) => {
  const path = pathCheck(ctx.dir);
  const url = urlCheck(ctx);
  const connection = connectionCheck(ctx);
  // A plain "A|B" matcher is a list of exact tool names; anything else is a regular expression tested against it.
  return {
    PreToolUse: [
      { matcher: "Read|Edit|Glob|Grep|NotebookEdit", hooks: [guarded(ctx, [["path", path]])] },
      { matcher: "Write", hooks: [guarded(ctx, [["path", path], ["write", writeCheck]])] },
      { matcher: "WebFetch", hooks: [guarded(ctx, [["url", url]])] },
      { matcher: "mcp__.*", hooks: [guarded(ctx, [["connection", connection]])] }, // plan and outputs pass through: not connections
    ],
  };
};

function guarded(ctx: GuardContext, checks: [GuardName, Check][]): HookCallback {
  return async (input) => {
    const { tool_name: tool, tool_input } = input as PreToolUseHookInput; // the matchers above only fire on PreToolUse
    let letThrough: Verdict | null = null; // the first flagged or unchecked verdict, if no guard blocks
    for (const [guard, check] of checks) {
      const verdict = await safely(guard, check, tool, tool_input);
      if (verdict.decision === "allowed") continue;
      try {
        await ctx.record({ guard, tool, ...verdict });
      } catch {
        // The decision stands even if the timeline write fails: a database hiccup must not open the gate.
      }
      if (verdict.decision === "blocked") return toHookOutput(verdict);
      letThrough ??= verdict;
    }
    return toHookOutput(letThrough ?? allowed("no guard objected"));
  };
}

/** A guard that crashed cannot vouch for the call, so it is stopped. The url guard's "Jev is down" never lands here. */
async function safely(guard: GuardName, check: Check, tool: string, input: unknown): Promise<Verdict> {
  try {
    return await check(tool, input);
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return { decision: "blocked", reason: `The ${guard} check failed (${why}), so the call was stopped.` };
  }
}

import type { BuildGuardHooks } from "@/contracts/guard";
import { pathGuard } from "../guard";

/**
 * Every guard as the SDK's PreToolUse hooks. WP0 keeps v1's path guard only; the guards package adds the url,
 * write and connection guards and records each decision through ctx.record.
 */
export const buildGuardHooks: BuildGuardHooks = (ctx) => {
  const guard = pathGuard(ctx.dir);
  return {
    PreToolUse: [
      { matcher: "Read|Write|Edit|Glob|Grep|NotebookEdit", hooks: [async (input) => guard(input as { tool_name: string; tool_input: unknown })] },
    ],
  }; // STUB: the guards package
};

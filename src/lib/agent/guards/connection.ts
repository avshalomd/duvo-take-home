import type { GuardContext } from "@/contracts/guard";
import { OUTPUTS_SERVER_KEY } from "@/lib/outputs/server";
import { PLAN_SERVER_KEY } from "../plan-state";
import { allowed, type Verdict } from "./verdict";

// Our own in-process servers, which run.ts adds to every run. Named here by key rather than left to connectionNames,
// because a connection a user calls "Plan" or "Outputs" gets the same key.
const OWN_SERVERS = new Set([PLAN_SERVER_KEY, OUTPUTS_SERVER_KEY]);

/**
 * The connection guard, on every mcp__<key>__<tool> call. The plan's `sources` is the agent's own statement of what
 * it will use, made before it acts; a connection it did not name is either a change of mind or a page talking it
 * into something, and the person should see which connection was used outside the plan. Flagged by default; a
 * workspace set to strict blocks it instead.
 */

/** "mcp__github_read_only__search" -> "github_read_only". A key never holds "__": connectionKey() collapses every run of punctuation to one "_". */
function serverKey(tool: string): string | null {
  if (!tool.startsWith("mcp__")) return null;
  const rest = tool.slice("mcp__".length);
  const end = rest.indexOf("__");
  return end > 0 ? rest.slice(0, end) : null;
}

/** Case-insensitive, either containing the other: the plan says "GitHub", the connection is "GitHub (read-only)". */
function named(sources: string[], spellings: string[]): boolean {
  const said = sources.map((s) => s.trim().toLowerCase()).filter(Boolean); // "" is contained in every name
  const names = spellings.map((n) => n.toLowerCase());
  return said.some((s) => names.some((n) => s.includes(n) || n.includes(s)));
}

// The tool's input is not read: which connection is called is the question, not what it is asked.
export function connectionCheck(
  ctx: Pick<GuardContext, "connectionNames" | "plan" | "strictConnections">,
): (tool: string, input?: unknown) => Verdict {
  return (tool) => {
    const key = serverKey(tool);
    if (!key || OWN_SERVERS.has(key)) return allowed("not a connection");
    const name = ctx.connectionNames[key];
    if (!name) return allowed("not a connection"); // only the workspace's connections are this guard's business

    const plan = ctx.plan(); // read at call time: the plan arrives after the hooks are built
    if (!plan) {
      return ctx.strictConnections
        ? { decision: "blocked", reason: `${name} was called before the plan named it. Call set_plan first, with ${name} in its sources if you need it.`, target: name }
        : { decision: "flagged", reason: `${name} was used before the plan named it.`, target: name };
    }
    if (named(plan.sources, [name, key])) return allowed("named in the plan");
    return ctx.strictConnections
      ? { decision: "blocked", reason: `${name} is not in the plan's sources, and this workspace only allows the connections the plan names. Do this step without it and say so in the report.`, target: name }
      : { decision: "flagged", reason: `Used ${name}, which was not in the plan.`, target: name };
  };
}

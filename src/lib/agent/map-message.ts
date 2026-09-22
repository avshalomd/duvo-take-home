import type { MapMessage } from "@/contracts/agent";
import type { Plan, RunEvent } from "@/contracts/run";
import { applyPlanCall, isPlanTool } from "./plan-state";

const PREVIEW_CHARS = 300; // the full tool output stays in the agent; the table keeps a readable head of it

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback = 0) => (typeof v === "number" ? v : fallback);

/** tool_result content is either a string or a list of content blocks; we want one readable string either way. */
function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => str(rec(c).text, "")).filter(Boolean).join("\n");
  return content == null ? "" : JSON.stringify(content);
}

/**
 * One mapper per run. It holds that run's plan and the ids of its plan-tool calls, so two runs in the same
 * process never share state and the plan tool's own bookkeeping stays out of the timeline.
 */
export function createMapper(): MapMessage {
  let plan: Plan | null = null;
  const planCallIds = new Set<string>();

  return (message: unknown, seq: number, at: string): RunEvent[] => {
    const m = rec(message);
    const events: RunEvent[] = [];
    const push = (e: Omit<RunEvent, "seq" | "at">) => events.push({ ...e, seq: seq + events.length, at } as RunEvent);

    if (m.type === "system") {
      if (m.subtype !== "init") return []; // thinking_tokens, post_turn_summary and friends are noise
      const servers = Array.isArray(m.mcp_servers) ? m.mcp_servers : [];
      push({
        kind: "started",
        payload: {
          model: str(m.model, "unknown"),
          tools: Array.isArray(m.tools) ? m.tools.map((t) => str(t)) : [],
          mcp_servers: servers.map((s) => ({ name: str(rec(s).name), status: str(rec(s).status, "unknown") })),
          cwd: str(m.cwd),
        },
      });
      return events;
    }

    if (m.type === "assistant") {
      const content = rec(m.message).content;
      for (const block of Array.isArray(content) ? content : []) {
        const b = rec(block);
        if (b.type === "text" && str(b.text)) push({ kind: "text", payload: { text: str(b.text) } });
        if (b.type !== "tool_use") continue;
        const name = str(b.name);
        if (isPlanTool(name)) {
          // A plan call is not work: it produces a plan event, never a tool_call, so `turn` counts real tools only.
          planCallIds.add(str(b.id));
          plan = applyPlanCall(plan, name, b.input);
          if (plan) push({ kind: "plan", payload: plan });
          continue;
        }
        push({ kind: "tool_call", payload: { tool_use_id: str(b.id), name, input: b.input } });
      }
      return events;
    }

    if (m.type === "user") {
      const content = rec(m.message).content;
      for (const block of Array.isArray(content) ? content : []) {
        const b = rec(block);
        if (b.type !== "tool_result") continue;
        const id = str(b.tool_use_id);
        if (planCallIds.has(id)) continue; // the plan tool's own "plan set" reply
        push({
          kind: "tool_result",
          payload: { tool_use_id: id, is_error: b.is_error === true, preview: resultText(b.content).slice(0, PREVIEW_CHARS) },
        });
      }
      return events;
    }

    if (m.type === "result") {
      push({
        kind: "finished",
        payload: {
          subtype: str(m.subtype, "unknown"),
          is_error: m.is_error === true,
          num_turns: num(m.num_turns),
          duration_ms: num(m.duration_ms),
          total_cost_usd: num(m.total_cost_usd),
          // An error result carries `errors: string[]` and no `result`: without this the provider's own words -
          // "API Error 429: rate limit exceeded" - are lost and the run shows a bare subtype.
          result: str(m.result) || (Array.isArray(m.errors) ? m.errors.map((e) => str(e, JSON.stringify(e))).join("; ") : ""),
        },
      });
      return events;
    }

    return []; // stream_event and anything a later SDK version adds
  };
}

/** The contract's MapMessage for a single message on its own; the run loop uses createMapper() to keep the plan. */
export const mapMessage: MapMessage = (message, seq, at) => createMapper()(message, seq, at);

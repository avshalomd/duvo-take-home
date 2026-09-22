import { describe, expect, it } from "vitest";
import { createMapper } from "./map-message";

// The SDK message shapes are the ones verified in .claude/docs/agent-sdk.md; we only build the fields we read.
const init = {
  type: "system",
  subtype: "init",
  model: "claude-sonnet-5",
  cwd: "runs/abc",
  tools: ["WebSearch", "Write", "mcp__deepwiki__read_wiki_structure"],
  mcp_servers: [
    { name: "deepwiki", status: "connected" },
    { name: "broken", status: "failed: 401 Unauthorized" },
  ],
};
const assistant = (content: unknown[]) => ({ type: "assistant", message: { content } });
const userResult = (r: Record<string, unknown>) => ({ type: "user", message: { content: [{ type: "tool_result", ...r }] } });

describe("mapMessage", () => {
  it("turns the init message into a started event with the model, the tools and every mcp server status", () => {
    const events = createMapper()(init, 1, "2026-09-22T09:00:00.000Z");
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("started");
    expect(events[0].seq).toBe(1);
    expect(events[0].at).toBe("2026-09-22T09:00:00.000Z");
    expect(events[0].payload).toMatchObject({
      model: "claude-sonnet-5",
      tools: ["WebSearch", "Write", "mcp__deepwiki__read_wiki_structure"],
      mcp_servers: [
        { name: "deepwiki", status: "connected" },
        { name: "broken", status: "failed: 401 Unauthorized" },
      ],
    });
  });

  it("turns assistant text into a text event and ignores thinking blocks", () => {
    const events = createMapper()(assistant([{ type: "thinking", thinking: "hmm" }, { type: "text", text: "Searching now." }]), 4, "t");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "text", seq: 4, payload: { text: "Searching now." } });
  });

  it("numbers several blocks of one message from the seq it was given", () => {
    const events = createMapper()(
      assistant([{ type: "text", text: "one" }, { type: "tool_use", id: "t1", name: "WebSearch", input: { query: "ai" } }]),
      7,
      "t",
    );
    expect(events.map((e) => [e.kind, e.seq])).toEqual([["text", 7], ["tool_call", 8]]);
  });

  it("keeps the full mcp__server__tool name on a connection's tool call", () => {
    const events = createMapper()(
      assistant([{ type: "tool_use", id: "t2", name: "mcp__deepwiki__read_wiki_structure", input: { repoName: "a/b" } }]),
      2,
      "t",
    );
    expect(events[0]).toMatchObject({
      kind: "tool_call",
      payload: { tool_use_id: "t2", name: "mcp__deepwiki__read_wiki_structure", input: { repoName: "a/b" } },
    });
  });

  it("turns a tool_result into a tool_result event with is_error and a 300-character preview", () => {
    const long = "x".repeat(500);
    const events = createMapper()(userResult({ tool_use_id: "t1", content: [{ type: "text", text: long }], is_error: false }), 3, "t");
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("tool_result");
    const payload = events[0].payload as { preview: string; is_error: boolean; tool_use_id: string };
    expect(payload.preview).toHaveLength(300);
    expect(payload.is_error).toBe(false);
    expect(payload.tool_use_id).toBe("t1");
  });

  it("marks a failed tool_result as an error and reads a plain string content", () => {
    const events = createMapper()(userResult({ tool_use_id: "t1", content: "API Error 400: web_search is not enabled", is_error: true }), 3, "t");
    expect(events[0].payload).toMatchObject({ is_error: true, preview: "API Error 400: web_search is not enabled" });
  });

  it("turns a set_plan call into a plan event with the steps pending, and records no tool_call for it", () => {
    const events = createMapper()(
      assistant([{
        type: "tool_use", id: "p1", name: "mcp__plan__set_plan",
        input: { intent: "Collect AI news", expectedOutputs: ["output.csv"], sources: ["web search"], steps: ["Search", "Write the CSV"] },
      }]),
      5,
      "t",
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "plan",
      seq: 5,
      payload: {
        intent: "Collect AI news",
        expectedOutputs: ["output.csv"],
        sources: ["web search"],
        steps: [
          { index: 0, title: "Search", status: "pending" },
          { index: 1, title: "Write the CSV", status: "pending" },
        ],
      },
    });
  });

  it("rebuilds the whole plan on update_step, keeping the steps set_plan established", () => {
    const map = createMapper();
    map(assistant([{
      type: "tool_use", id: "p1", name: "mcp__plan__set_plan",
      input: { intent: "Collect AI news", expectedOutputs: ["output.csv"], sources: [], steps: ["Search", "Write the CSV"] },
    }]), 1, "t");
    const events = map(assistant([{ type: "tool_use", id: "p2", name: "mcp__plan__update_step", input: { index: 0, status: "done", note: "8 stories" } }]), 2, "t");
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({
      intent: "Collect AI news",
      steps: [
        { index: 0, title: "Search", status: "done", note: "8 stories" },
        { index: 1, title: "Write the CSV", status: "pending" },
      ],
    });
  });

  it("does not record the plan tool's own result in the timeline", () => {
    const map = createMapper();
    map(assistant([{ type: "tool_use", id: "p1", name: "mcp__plan__set_plan", input: { intent: "i", expectedOutputs: ["o"], sources: [], steps: ["s"] } }]), 1, "t");
    expect(map(userResult({ tool_use_id: "p1", content: "plan set" }), 2, "t")).toEqual([]);
  });

  it("turns the result message into a finished event with subtype, turns, duration and cost", () => {
    const events = createMapper()(
      { type: "result", subtype: "error_max_turns", is_error: true, num_turns: 12, duration_ms: 151554, total_cost_usd: 0.447, result: "Reached the turn limit" },
      9,
      "t",
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "finished",
      payload: { subtype: "error_max_turns", is_error: true, num_turns: 12, duration_ms: 151554, total_cost_usd: 0.447, result: "Reached the turn limit" },
    });
  });

  it("records nothing for a system message that is not init, or for an unknown message", () => {
    const map = createMapper();
    expect(map({ type: "system", subtype: "post_turn_summary", summary: "x" }, 1, "t")).toEqual([]);
    expect(map({ type: "stream_event", event: {} }, 1, "t")).toEqual([]);
    expect(map(null, 1, "t")).toEqual([]);
  });
});

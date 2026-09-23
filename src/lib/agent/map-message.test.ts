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

  // Q33: the state card called every tool call a "turn", so it read 8 of 25 while the SDK's result said 3. The
  // turn is the assistant message, so the mapper counts those and stamps the number on every event it makes.
  it("stamps each event with the assistant turn it belongs to, counting assistant messages and not tool calls", () => {
    const map = createMapper();
    expect((map(init, 1, "t")[0].payload as unknown as { turn: number }).turn).toBe(0); // the init message is before any turn
    const first = map(assistant([{ type: "tool_use", id: "t1", name: "WebSearch", input: {} }, { type: "tool_use", id: "t2", name: "WebSearch", input: {} }]), 2, "t");
    expect(first.map((e) => (e.payload as unknown as { turn: number }).turn)).toEqual([1, 1]); // two tools, one turn
    expect((map(userResult({ tool_use_id: "t1", content: "ok" }), 4, "t")[0].payload as unknown as { turn: number }).turn).toBe(1);
    const second = map(assistant([{ type: "text", text: "Writing it up." }]), 5, "t");
    expect((second[0].payload as unknown as { turn: number }).turn).toBe(2);
  });

  // Q7: the SDK's error result carries `errors: string[]` and no `result`, so the provider's own words - the only
  // thing that tells a user why the run died - were dropped on the floor and the run showed a bare subtype.
  it("keeps the provider's words from an error result, which arrive in errors[] and not in result", () => {
    const events = createMapper()(
      {
        type: "result",
        subtype: "error_during_execution",
        is_error: true,
        num_turns: 3,
        errors: ["API Error 429: rate limit exceeded", "retry in 60s"],
      },
      9,
      "t",
    );
    expect(events[0].payload).toMatchObject({
      subtype: "error_during_execution",
      is_error: true,
      result: "API Error 429: rate limit exceeded; retry in 60s",
    });
  });

  it("prefers the result text when the SDK sends both a result and errors", () => {
    const events = createMapper()(
      { type: "result", subtype: "success", is_error: false, result: "Wrote output.csv", errors: [] },
      1,
      "t",
    );
    expect((events[0].payload as { result: string }).result).toBe("Wrote output.csv");
  });

  // Q128: a refused or failed turn must leave a readable line in the timeline, not an empty turn.
  it("records a turn the model refused (stop_reason refusal) as a readable notice with the API's category", () => {
    const events = createMapper()(
      { type: "assistant", message: { content: [], stop_reason: "refusal", stop_details: { category: "cyber", explanation: "Looks like scanning." } } },
      5,
      "t",
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "text", seq: 5, payload: { notice: "refusal", turn: 1 } });
    expect(events[0].kind === "text" && events[0].payload.text).toBe("The model declined to continue this step (flagged as cyber): Looks like scanning.");
  });

  it("records the SDK's refusal fallback: the step was declined and tried again on another model", () => {
    const events = createMapper()(
      { type: "system", subtype: "model_refusal_fallback", original_model: "claude-sonnet-5", fallback_model: "claude-opus-5", api_refusal_category: "cyber", content: "x" },
      1,
      "t",
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "text", payload: { notice: "refusal" } });
    expect(events[0].kind === "text" && events[0].payload.text).toBe("The model declined a step (flagged as cyber); it was tried again on claude-opus-5.");
  });

  it("records a refusal with no fallback: the step was declined and no other model could try it", () => {
    const events = createMapper()({ type: "system", subtype: "model_refusal_no_fallback", original_model: "claude-sonnet-5", api_refusal_category: null, content: "x" }, 1, "t");
    expect(events.map((e) => e.kind === "text" && e.payload.text)).toEqual(["The model declined a step, and no other model could try it."]);
  });

  it("records an API error the SDK puts on an assistant message that carried no text, in plain words", () => {
    const events = createMapper()({ type: "assistant", error: "rate_limit", message: { content: [] } }, 1, "t");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "text", payload: { notice: "api_error" } });
    expect(events[0].kind === "text" && events[0].payload.text).toBe("The model's reply failed: too many requests.");
  });

  it("does not add a second line when the failed message already carries the provider's words", () => {
    const events = createMapper()({ type: "assistant", error: "server_error", message: { content: [{ type: "text", text: "API Error: 500 Internal" }] } }, 1, "t");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "text", payload: { text: "API Error: 500 Internal" } });
  });

  it("records an API retry in plain words, with the attempt and the HTTP status", () => {
    const events = createMapper()({ type: "system", subtype: "api_retry", attempt: 2, max_retries: 10, retry_delay_ms: 4000, error_status: 529, error: "overloaded" }, 1, "t");
    expect(events.map((e) => e.kind === "text" && e.payload.text)).toEqual(["The model did not answer (it is overloaded, HTTP 529); trying again (2 of 10)."]);
    expect(events[0]).toMatchObject({ payload: { notice: "api_retry" } });
  });

  it("records a tool call the SDK denied before it ran", () => {
    const events = createMapper()({ type: "system", subtype: "permission_denied", tool_name: "WebFetch", tool_use_id: "tu_9", decision_reason_type: "classifier" }, 1, "t");
    expect(events.map((e) => e.kind === "text" && e.payload.text)).toEqual(["The WebFetch call was blocked before it ran (classifier)."]);
  });

  it("does not count a system notice as a turn", () => {
    const map = createMapper();
    map(assistant([{ type: "text", text: "one" }]), 1, "t");
    const [notice] = map({ type: "system", subtype: "api_retry", attempt: 1, max_retries: 3, error_status: null, error: "unknown" }, 2, "t");
    expect(notice.payload).toMatchObject({ turn: 1 });
  });

  it("records nothing for a system message that is not init, or for an unknown message", () => {
    const map = createMapper();
    expect(map({ type: "system", subtype: "post_turn_summary", summary: "x" }, 1, "t")).toEqual([]);
    expect(map({ type: "stream_event", event: {} }, 1, "t")).toEqual([]);
    expect(map(null, 1, "t")).toEqual([]);
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RunEvent } from "@/contracts/run";
import { ToolCard } from "./tool-card";

const call: Extract<RunEvent, { kind: "tool_call" }> = {
  seq: 1,
  at: "2026-09-24T10:00:00.000Z",
  kind: "tool_call",
  payload: { tool_use_id: "t1", name: "WebSearch", input: { query: "ai" } },
};
const result: Extract<RunEvent, { kind: "tool_result" }> = {
  seq: 2,
  at: "2026-09-24T10:00:01.000Z",
  kind: "tool_result",
  payload: { tool_use_id: "t1", preview: "a long result ".repeat(20), is_error: false },
};

// Review (frontend): the "more" toggle said nothing to a screen reader and showed no focus to a keyboard
describe("a tool card's more/less toggle", () => {
  const html = renderToStaticMarkup(<ToolCard call={call} result={result} connections={[]} />);
  const toggle = html.match(/<button[^>]*>more<\/button>/)?.[0] ?? "";

  it("says whether the result is expanded", () => {
    expect(toggle).toContain('aria-expanded="false"');
  });

  it("draws the app's focus ring when the keyboard reaches it", () => {
    expect(toggle).toContain("focus-visible:ring-[3px]");
  });
});

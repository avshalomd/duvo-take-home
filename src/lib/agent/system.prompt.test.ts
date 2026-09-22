import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT } from "./system.prompt";

// QA round 3 (Q49): on an injection prompt the agent refused and called no tool at all, so the run closed with no
// plan and the judge failed it. The prompt is the only place that behaviour is specified, so it is pinned here.
describe("SYSTEM_PROMPT", () => {
  it("orders the plan call before the agent decides anything, including a refusal", () => {
    expect(SYSTEM_PROMPT).toMatch(/even if you are going to refuse/i);
    expect(SYSTEM_PROMPT.indexOf("set_plan")).toBeLessThan(SYSTEM_PROMPT.search(/even if you are going to refuse/i));
  });

  it("gives the refusal its own one-step plan and its own report, so a refused run is still readable", () => {
    expect(SYSTEM_PROMPT).toContain('steps: ["Explain why this cannot be done"]');
    expect(SYSTEM_PROMPT).toMatch(/intent[^\n]*what (the user |they )?asked/i);
  });
});

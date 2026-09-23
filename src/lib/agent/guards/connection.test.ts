import { describe, expect, it } from "vitest";
import type { Plan } from "@/contracts/run";
import { connectionCheck } from "./connection";

// The plan's `sources` is the agent's own statement of what it will use. A connection it did not name is worth
// showing ("used GitHub, which was not in the plan"); a strict workspace refuses it.
const names = { github: "GitHub", deepwiki: "DeepWiki", github_read_only: "GitHub (read-only)" };
const planWith = (sources: string[]): Plan => ({
  intent: "Summarise the repository's open issues",
  expectedOutputs: ["report.md"],
  sources,
  steps: [{ index: 0, title: "List the issues", status: "running" }],
});
const guard = (plan: Plan | null, strictConnections = false) =>
  connectionCheck({ connectionNames: names, plan: () => plan, strictConnections });

describe("connection guard: a connection the plan named", () => {
  it("allows the call, whatever the case the plan wrote the name in", () => {
    expect(guard(planWith(["deepwiki"]))("mcp__deepwiki__ask_question", {})).toMatchObject({ decision: "allowed" });
  });

  it("allows it when the source contains the name, or the name contains the source", () => {
    expect(guard(planWith(["the DeepWiki server"]))("mcp__deepwiki__ask_question", {})).toMatchObject({ decision: "allowed" });
    expect(guard(planWith(["GitHub"]))("mcp__github_read_only__search_issues", {})).toMatchObject({ decision: "allowed" });
  });

  it("allows it when the plan names the connection by its tool prefix", () => {
    expect(guard(planWith(["github_read_only"]))("mcp__github_read_only__search_issues", {})).toMatchObject({ decision: "allowed" });
  });
});

describe("connection guard: a connection the plan did not name", () => {
  it("flags the call and lets it through, naming the connection", () => {
    const v = guard(planWith(["WebSearch"]))("mcp__github__list_issues", {});
    expect(v).toMatchObject({ decision: "flagged", target: "GitHub" });
    expect(v.reason).toMatch(/GitHub.*not in the plan/i);
  });

  it("blocks the call when the workspace is strict, and tells the agent to do without it", () => {
    const v = guard(planWith(["WebSearch"]), true)("mcp__github__list_issues", {});
    expect(v).toMatchObject({ decision: "blocked", target: "GitHub" });
    expect(v.reason).toMatch(/without it/i);
  });

  it("ignores an empty source, which would otherwise contain every name", () => {
    expect(guard(planWith([""]))("mcp__github__list_issues", {})).toMatchObject({ decision: "flagged" });
  });
});

describe("connection guard: before any plan exists", () => {
  it("flags a connection call as used before the plan named it", () => {
    const v = guard(null)("mcp__github__list_issues", {});
    expect(v).toMatchObject({ decision: "flagged", target: "GitHub" });
    expect(v.reason).toMatch(/before the plan named it/i);
  });

  it("blocks it in a strict workspace and tells the agent to set its plan first", () => {
    const v = guard(null, true)("mcp__github__list_issues", {});
    expect(v).toMatchObject({ decision: "blocked" });
    expect(v.reason).toMatch(/set_plan/);
  });

  it("reads the plan at call time, so a plan set after the guard was built counts", () => {
    let plan: Plan | null = null;
    const check = connectionCheck({ connectionNames: names, plan: () => plan, strictConnections: false });
    expect(check("mcp__github__list_issues", {})).toMatchObject({ decision: "flagged" });
    plan = planWith(["GitHub"]);
    expect(check("mcp__github__list_issues", {})).toMatchObject({ decision: "allowed" });
  });
});

describe("connection guard: tools that are not connections", () => {
  it("leaves the plan and output tools alone, even before a plan exists", () => {
    expect(guard(null, true)("mcp__plan__set_plan", {})).toMatchObject({ decision: "allowed" });
    expect(guard(null, true)("mcp__outputs__make_chart", {})).toMatchObject({ decision: "allowed" });
  });

  it("leaves native tools alone", () => {
    expect(guard(null, true)("WebSearch", {})).toMatchObject({ decision: "allowed" });
  });
});

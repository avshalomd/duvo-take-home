import { describe, expect, it } from "vitest";
import type { Plan } from "@/contracts/run";
import { applyPlanCall, untickedMarked } from "./plan-state";

const plan = (statuses: Plan["steps"][number]["status"][]): Plan => ({
  intent: "Working days in Norway, October 2026",
  expectedOutputs: ["an answer"],
  sources: [],
  steps: statuses.map((status, index) => ({ index, title: `Step ${index + 1}`, status, ...(index === 1 ? { note: "checked the calendar" } : {}) })),
});

// qa-ai F8 (the owner's call): the agent answered right and forgot to tick steps 2 and 3, and the run read "1 of 3 done"
// with "Not started" steps. When the agent ends successfully, code marks what it left as "not marked".
describe("untickedMarked", () => {
  it("marks the steps a successful agent left pending or running as not marked, keeping their notes", () => {
    expect(untickedMarked(plan(["done", "running", "pending"]))?.steps).toEqual([
      { index: 0, title: "Step 1", status: "done" },
      { index: 1, title: "Step 2", status: "unmarked", note: "checked the calendar" },
      { index: 2, title: "Step 3", status: "unmarked" },
    ]);
  });

  it("leaves done and skipped steps as they are", () => {
    expect(untickedMarked(plan(["done", "skipped", "pending"]))?.steps.map((s) => s.status)).toEqual(["done", "skipped", "unmarked"]);
  });

  it("is null when every step is settled, or there is no plan: nothing to write", () => {
    expect(untickedMarked(plan(["done", "skipped"]))).toBeNull();
    expect(untickedMarked(null)).toBeNull();
  });
});

// qa-ai F14 (the owner's call): a fix attempt kept the plan and re-marked a done step, "Explain that the request is too
// ambiguous", with a note about the list it then made. The plan stays; the fix is a step of its own, titled by what it
// changed, and a step already done keeps what it said the first time.
describe("applyPlanCall in a fix attempt", () => {
  const fix = (title: string, note?: string) => ({ title, ...(note ? { note } : {}) });

  it("records the fix attempt's own step with the title the agent gives it, by attempt", () => {
    const first = applyPlanCall(plan(["done", "done"]), "mcp__plan__describe_fix", fix("Made a list of AI coding tools", "picked 6 tools"), 1);
    expect(first?.fixes).toEqual([{ attempt: 1, title: "Made a list of AI coding tools", note: "picked 6 tools" }]);
    const second = applyPlanCall(first, "mcp__plan__describe_fix", fix("Added the prices"), 2);
    expect(second?.fixes?.map((f) => f.attempt)).toEqual([1, 2]);
    expect(second?.steps).toEqual(plan(["done", "done"]).steps); // the plan itself is kept
  });

  it("keeps the last title an attempt gives itself", () => {
    const once = applyPlanCall(plan(["done"]), "mcp__plan__describe_fix", fix("Quoted the titles"), 1);
    expect(applyPlanCall(once, "mcp__plan__describe_fix", fix("Quoted the titles and the sources"), 1)?.fixes).toEqual([
      { attempt: 1, title: "Quoted the titles and the sources" },
    ]);
  });

  it("records no fix outside a fix attempt: there is no attempt to name", () => {
    const p = plan(["done"]);
    expect(applyPlanCall(p, "mcp__plan__describe_fix", fix("Quoted the titles"), null)).toBe(p);
  });

  it("leaves a step already done as it was, so its title and note still say what it did", () => {
    const p = plan(["done", "done"]);
    const redone = applyPlanCall(p, "mcp__plan__update_step", { index: 1, status: "done", note: "researched a list instead" }, 1);
    expect(redone?.steps[1]).toEqual({ index: 1, title: "Step 2", status: "done", note: "checked the calendar" });
    expect(applyPlanCall(p, "mcp__plan__update_step", { index: 0, status: "running" }, 1)?.steps[0].status).toBe("done");
  });

  it("still lets a fix attempt tick a step that was not done", () => {
    const p = plan(["done", "skipped", "unmarked"]);
    const ticked = applyPlanCall(applyPlanCall(p, "mcp__plan__update_step", { index: 1, status: "done", note: "found it" }, 1), "mcp__plan__update_step", { index: 2, status: "done" }, 1);
    expect(ticked?.steps.map((s) => s.status)).toEqual(["done", "done", "done"]);
  });

  it("marks steps again as before outside a fix attempt", () => {
    expect(applyPlanCall(plan(["done"]), "mcp__plan__update_step", { index: 0, status: "skipped", note: "not needed" })?.steps[0]).toMatchObject({ status: "skipped", note: "not needed" });
  });
});

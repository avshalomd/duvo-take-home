import { describe, expect, it } from "vitest";
import type { AutomationTemplate } from "@/contracts/automation";
import type { EvaluateInput } from "@/contracts/eval";
import type { Plan, PlanStep } from "@/contracts/run";
import { runChecks } from "./checks";

// A run of a saved automation is also held to the automation: the files it promises must exist, and the plan must
// keep its steps. The agent rewords steps ("Search the web for Acme Robotics and its news"), so the step match is
// tolerant; what it must not tolerate is a step that is gone, or skipped without a word.

const template: AutomationTemplate = {
  instructions: "Write a one-page brief on {input}: what it does, its recent news and the main risks. Save it as brief.md.",
  intent: "A one-page company brief",
  expectedOutputs: ["brief.md with the sections Overview, News, Risks"],
  outputFormat: "Markdown with the headings Overview, News, Risks",
  steps: ["Search the web for {input}", "Read the company's latest annual report", "Write brief.md", "Report what was found"],
  connections: [],
};

const step = (title: string, status: PlanStep["status"] = "done", note?: string): [string, PlanStep["status"], string?] => [title, status, note];
function plan(...steps: [string, PlanStep["status"], string?][]): Plan {
  return {
    intent: "A brief on Acme Robotics",
    expectedOutputs: ["brief.md"],
    sources: ["web search"],
    steps: steps.map(([title, status, note], index) => (note ? { index, title, status, note } : { index, title, status })),
  };
}

const keptPlan = plan(
  step("Search the web for Acme Robotics"),
  step("Read the company's latest annual report"),
  step("Write brief.md"),
  step("Report what was found"),
);

function input(over: Partial<EvaluateInput> = {}): EvaluateInput {
  return {
    prompt: template.instructions.replaceAll("{input}", "Acme Robotics"),
    runStatus: "succeeded",
    report: "Wrote brief.md.",
    plan: keptPlan,
    files: [{ name: "brief.md", content: "# Acme Robotics\n\n## Overview\n...\n## News\n...\n## Risks\n...\n" }],
    today: "2026-09-22",
    template,
    ...over,
  };
}

const check = (i: EvaluateInput, id: string) => runChecks(i).find((c) => c.id === id);
const templateIds = (i: EvaluateInput) => runChecks(i).map((c) => c.id).filter((id) => id.startsWith("template_"));

describe("template checks", () => {
  it("adds no template check to a run that is not a saved automation", () => {
    expect(templateIds(input({ template: null }))).toEqual([]);
    expect(templateIds(input({ template: undefined }))).toEqual([]);
  });

  it("passes a run that wrote the promised file and kept every step of the automation", () => {
    expect(check(input(), "template_outputs")?.ok).toBe(true);
    expect(check(input(), "template_steps")?.ok).toBe(true);
  });

  it("keeps a step the agent reworded in its own words", () => {
    const reworded = plan(
      step("Search the web for Acme Robotics and its recent news"),
      step("Read Acme Robotics' latest annual report"),
      step("Write brief.md with Overview, News and Risks"),
      step("Report what I found"),
    );
    const got = check(input({ plan: reworded }), "template_steps");
    expect(got?.ok, got?.detail).toBe(true);
  });

  it("counts a step skipped with a note as kept: the agent said why it could not be done", () => {
    const skipped = plan(
      step("Search the web for Acme Robotics"),
      step("Read the company's latest annual report", "skipped", "Acme Robotics is private and publishes no annual report."),
      step("Write brief.md"),
      step("Report what was found"),
    );
    expect(check(input({ plan: skipped }), "template_steps")?.ok).toBe(true);
  });

  it("fails a step skipped without a note: a silent skip is a dropped step", () => {
    const silent = plan(step("Search the web for Acme Robotics"), step("Read the company's latest annual report", "skipped"), step("Write brief.md"), step("Report what was found"));
    const got = check(input({ plan: silent }), "template_steps");
    expect(got?.ok).toBe(false);
    expect(got?.detail).toMatch(/annual report/);
    expect(got?.detail).toMatch(/skipped without a note/);
  });

  it("fails 'template_steps' and names the step the plan dropped", () => {
    const dropped = plan(step("Search the web for Acme Robotics"), step("Write brief.md"), step("Report what was found"));
    const got = check(input({ plan: dropped }), "template_steps");
    expect(got?.ok).toBe(false);
    expect(got?.detail).toMatch(/step 2/i);
    expect(got?.detail).toMatch(/Read the company's latest annual report/);
  });

  it("does not count a step as kept on one shared word", () => {
    // "report" is in both titles; the step it stands for - reading the annual report - is not in the plan
    const lookalike = plan(step("Search the web for Acme Robotics"), step("Write the report"), step("Write brief.md"), step("Report what was found"));
    expect(check(input({ plan: lookalike }), "template_steps")?.ok).toBe(false);
  });

  it("fails steps that come out of the automation's order", () => {
    const reversed = plan(step("Report what was found"), step("Write brief.md"), step("Read the company's latest annual report"), step("Search the web for Acme Robotics"));
    expect(check(input({ plan: reversed }), "template_steps")?.ok).toBe(false);
  });

  it("fails 'template_steps' when the run recorded no plan to compare", () => {
    const got = check(input({ plan: null }), "template_steps");
    expect(got?.ok).toBe(false);
    expect(got?.detail).toMatch(/no plan/i);
  });

  it("fails 'template_outputs' and names the file when the promised file was not written", () => {
    const got = check(input({ files: [{ name: "summary.md", content: "# Acme\n" }] }), "template_outputs");
    expect(got?.ok).toBe(false);
    expect(got?.detail).toMatch(/brief\.md/);
  });

  it("matches a promised file name whatever its case", () => {
    expect(check(input({ files: [{ name: "Brief.md", content: "# Acme\n" }] }), "template_outputs")?.ok).toBe(true);
  });

  it("reads {input} in a promised file name as any text", () => {
    const t = { ...template, expectedOutputs: ["audit-{input}.md"] };
    expect(check(input({ template: t, files: [{ name: "audit-acme-robotics.md", content: "x" }] }), "template_outputs")?.ok).toBe(true);
    expect(check(input({ template: t, files: [{ name: "audit.md", content: "x" }] }), "template_outputs")?.ok).toBe(false);
  });

  it("matches the file type when the automation names a format rather than a file", () => {
    const t = { ...template, expectedOutputs: ["a CSV of the stories, one row each"] };
    expect(check(input({ template: t, files: [{ name: "stories.csv", content: "title\nA\n" }] }), "template_outputs")?.ok).toBe(true);
    const got = check(input({ template: t, files: [{ name: "stories.md", content: "x" }] }), "template_outputs");
    expect(got?.ok).toBe(false);
    expect(got?.detail).toMatch(/\.csv/);
  });

  it("leaves an output that names no file or format to the judge", () => {
    const t = { ...template, expectedOutputs: ["a short answer in the report"] };
    expect(check(input({ template: t }), "template_outputs")).toBeUndefined();
  });
});

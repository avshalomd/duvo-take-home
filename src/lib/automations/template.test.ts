import { describe, expect, it } from "vitest";
import type { AutomationTemplate, Trial } from "@/contracts/automation";
import { canApprove, changesThePrompt, fillTemplate } from "./template";

const template: AutomationTemplate = {
  instructions: "Audit {input}: ownership, filings and the news of the last 90 days. Write audit.md.",
  intent: "Audit a company",
  expectedOutputs: ["audit.md with sections Ownership, Filings, News, Risks"],
  outputFormat: "Markdown headings: Ownership, Filings, News, Risks",
  steps: ["Search the web for {input}", "Read the filings", "Write audit.md"],
  connections: [],
};
const audit = { name: "Company audit", inputLabel: "Company name", template };

describe("fillTemplate", () => {
  it("puts the input where {input} is in the instructions", () => {
    expect(fillTemplate(audit, "Apple Inc.").prompt).toBe(
      "Audit Apple Inc.: ownership, filings and the news of the last 90 days. Write audit.md.",
    );
  });

  it("fills every {input}, not only the first", () => {
    const twice = { ...audit, template: { ...template, instructions: "Compare {input} with the market; name {input} in the title." } };
    expect(fillTemplate(twice, "Acme").prompt).toBe("Compare Acme with the market; name Acme in the title.");
  });

  // replaceAll with a string reads $&, $$ and $' in the replacement as patterns: "/audit Johnson $& Sons" kept "{input}"
  it("puts an input with $ patterns in as typed, in the prompt and in the steps", () => {
    const typed = "Johnson $& Sons $$ $' $` $1";
    const { prompt, systemAddendum } = fillTemplate(audit, typed);
    expect(prompt).toBe(`Audit ${typed}: ownership, filings and the news of the last 90 days. Write audit.md.`);
    expect(systemAddendum).toContain(`1. Search the web for ${typed}`);
    expect(systemAddendum).not.toContain("{input}");
  });

  it("names the automation and its input in the system addendum", () => {
    const { systemAddendum } = fillTemplate(audit, "Apple Inc.");
    expect(systemAddendum).toContain('This run follows the saved automation "Company audit".');
    expect(systemAddendum).toContain("Company name");
    expect(systemAddendum).toContain("Apple Inc.");
  });

  it("lists the steps in order with the input filled, so the agent plans them", () => {
    const { systemAddendum } = fillTemplate(audit, "Apple Inc.");
    expect(systemAddendum).toContain("Plan these steps");
    expect(systemAddendum).toContain("1. Search the web for Apple Inc.");
    expect(systemAddendum).toContain("2. Read the filings");
    expect(systemAddendum).toContain("3. Write audit.md");
    expect(systemAddendum).not.toContain("{input}");
  });

  it("says what to produce and in which format", () => {
    const { systemAddendum } = fillTemplate(audit, "Apple Inc.");
    expect(systemAddendum).toContain("Produce: audit.md with sections Ownership, Filings, News, Risks");
    expect(systemAddendum).toContain("Markdown headings: Ownership, Filings, News, Risks");
  });

  it("tells the agent to mark an impossible step skipped and say why, instead of dropping it", () => {
    expect(fillTemplate(audit, "Apple Inc.").systemAddendum).toContain(
      "If the input makes a step impossible, mark it skipped and say why.",
    );
  });

  it("leaves the format line out when the template has none", () => {
    const plain = { ...audit, template: { ...template, outputFormat: "" } };
    expect(fillTemplate(plain, "Apple Inc.").systemAddendum).not.toMatch(/format/i);
  });
});

const trial = (over: Partial<Trial>): Trial => ({
  runId: "00000000-0000-4000-8000-000000000001",
  input: "Apple Inc.",
  version: 2,
  status: "succeeded",
  outcome: "pass",
  humanVerdict: null,
  humanVerdictBy: null,
  humanNote: null,
  createdAt: "2026-09-23T10:00:00.000Z",
  ...over,
});

describe("canApprove", () => {
  it("refuses with no examples, and says to run one", () => {
    const r = canApprove([], 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/run an example/i);
  });

  it("allows one approved example of the current version", () => {
    expect(canApprove([trial({ humanVerdict: "approved" })], 2)).toEqual({ ok: true });
  });

  it("refuses when an example of the current version is marked not right, even beside an approved one", () => {
    const r = canApprove([trial({ humanVerdict: "approved" }), trial({ runId: "b", humanVerdict: "rejected" })], 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not right/i);
  });

  it("refuses when the only approved examples are of an earlier version, and says so", () => {
    const r = canApprove([trial({ version: 1, humanVerdict: "approved" })], 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/earlier version/i);
  });

  it("does not let a rejected example of an earlier version block the current one", () => {
    const trials = [trial({ version: 1, humanVerdict: "rejected" }), trial({ runId: "b", humanVerdict: "approved" })];
    expect(canApprove(trials, 2)).toEqual({ ok: true });
  });

  it("asks to wait while the example is still running", () => {
    const r = canApprove([trial({ status: "running", outcome: null })], 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/finish/i);
  });

  it("asks for a judgment when the example finished but nobody judged it", () => {
    const r = canApprove([trial({})], 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/looks right/i);
  });
});

describe("changesThePrompt", () => {
  const before = { name: "Company audit", inputLabel: "Company name", template };

  it("is false when only the hint, the example or the command changed, which the agent never sees", () => {
    expect(changesThePrompt(before, { ...before })).toBe(false);
  });

  it("is true when the instructions changed", () => {
    expect(changesThePrompt(before, { ...before, template: { ...template, instructions: "Audit {input} briefly." } })).toBe(true);
  });

  it("is true when a step or an output changed", () => {
    expect(changesThePrompt(before, { ...before, template: { ...template, steps: ["Search the web for {input}"] } })).toBe(true);
    expect(changesThePrompt(before, { ...before, template: { ...template, expectedOutputs: ["audit.csv"] } })).toBe(true);
  });

  it("is true when a required connection changed, because the run then gets different tools", () => {
    expect(changesThePrompt(before, { ...before, template: { ...template, connections: ["DeepWiki"] } })).toBe(true);
  });

  it("is true when the name or the input label changed, because both are in the system addendum", () => {
    expect(changesThePrompt(before, { ...before, name: "Audit" })).toBe(true);
    expect(changesThePrompt(before, { ...before, inputLabel: "Company" })).toBe(true);
  });
});

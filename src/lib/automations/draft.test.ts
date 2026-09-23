import { describe, expect, it } from "vitest";
import { LlmError } from "@/lib/llm/errors";
import { scriptedModel } from "@/lib/llm/test-models";
import { draftAutomation } from "./draft";
import { draftInput } from "./draft.prompt";

// A finished run as the draft step receives it: the instructions, the last plan, the report and the files.
const run = {
  prompt: "Audit Acme Ltd: who owns it, its last filings and the news of the last 90 days. Write audit.md.",
  plan: {
    intent: "An audit of Acme Ltd",
    expectedOutputs: ["audit.md"],
    sources: ["web search"],
    steps: [
      { index: 0, title: "Search the web for Acme Ltd", status: "done" },
      { index: 1, title: "Read the filings", status: "done", note: "found 3 filings" },
      { index: 2, title: "Write audit.md", status: "done" },
    ],
  },
  report: "I searched the web for Acme Ltd, read three filings and wrote audit.md.",
  files: [{ name: "audit.md", content: "# Acme Ltd\n## Ownership\nAcme is owned by...\n## Filings\n" }],
};

const draft = {
  name: "Company audit",
  command: "audit",
  description: "Audits a company: ownership, filings and recent news, in audit.md.",
  inputLabel: "Company name",
  inputHint: "The company's registered name, e.g. Apple Inc.",
  inputExample: "Acme Ltd",
  template: {
    instructions: "Audit {input}: who owns it, its last filings and the news of the last 90 days. Write audit.md.",
    intent: "Audits a company: ownership, filings and recent news, in audit.md.",
    expectedOutputs: ["audit.md with sections Ownership, Filings, News"],
    outputFormat: "Markdown headings: Ownership, Filings, News",
    steps: ["Search the web for {input}", "Read the filings", "Write audit.md"],
    connections: [],
  },
};

// fallback: () => null keeps the tests off the network even with a provider key in the environment.
const offline = { fallback: () => null };

describe("draftAutomation", () => {
  it("returns the model's draft, checked against AutomationDraft", async () => {
    const result = await draftAutomation(run, { ...offline, model: () => scriptedModel([JSON.stringify(draft)]) });
    expect(result.name).toBe("Company audit");
    expect(result.command).toBe("audit");
    expect(result.inputExample).toBe("Acme Ltd");
    expect(result.template.instructions).toContain("{input}");
    expect(result.template.steps).toHaveLength(3);
  });

  it("refuses a draft whose instructions forget {input}, as an off-schema LlmError", async () => {
    const noPlaceholder = { ...draft, template: { ...draft.template, instructions: "Audit Acme Ltd and write audit.md." } };
    const err = await draftAutomation(run, { ...offline, model: () => scriptedModel([JSON.stringify(noPlaceholder)]) }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.kind).toBe("off-schema");
  });

  it("turns an answer that is not a draft at all into an LlmError the user can read", async () => {
    const err = await draftAutomation(run, { ...offline, model: () => scriptedModel(['{"name": 3}']) }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.message).toMatch(/did not fit/);
  });
});

describe("draftInput", () => {
  it("carries the run's instructions, its final plan and its report", () => {
    const text = draftInput(run);
    expect(text).toContain(run.prompt);
    expect(text).toContain("1. Search the web for Acme Ltd (done)");
    expect(text).toContain("2. Read the filings (done) - found 3 filings");
    expect(text).toContain("web search");
    expect(text).toContain(run.report);
  });

  it("shows the first lines of each file under its name", () => {
    const text = draftInput(run);
    expect(text).toContain("audit.md");
    expect(text).toContain("## Ownership");
  });

  it("keeps only the first lines of a long file, so a big CSV does not flood the prompt", () => {
    const rows = Array.from({ length: 200 }, (_, i) => `row ${i},https://example.com/${i}`).join("\n");
    const text = draftInput({ ...run, files: [{ name: "output.csv", content: `title,url\n${rows}` }] });
    expect(text).toContain("title,url");
    expect(text).toContain("row 0,");
    expect(text).not.toContain("row 150,");
  });

  it("says so when the run had no plan, no report or no files", () => {
    const text = draftInput({ prompt: "What is an agent?", plan: null, report: null, files: [] });
    expect(text).toContain("What is an agent?");
    expect(text).toMatch(/no plan/i);
    expect(text).toMatch(/no files/i);
  });
});

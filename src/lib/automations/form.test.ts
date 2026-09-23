import { describe, expect, it } from "vitest";
import { parseEditForm } from "./form";

function form(over: Record<string, string | string[]> = {}): FormData {
  const fields: Record<string, string | string[]> = {
    name: "Company audit",
    command: "audit",
    description: "Audits a company",
    inputLabel: "Company name",
    inputHint: "e.g. Apple Inc.",
    inputExample: "Acme Ltd",
    instructions: "Audit {input} and write audit.md.",
    expectedOutputs: "audit.md with sections Ownership, Filings\n\n a short report \n",
    outputFormat: "Markdown headings",
    steps: "Search the web for {input}\nRead the filings\nWrite audit.md",
    connections: ["DeepWiki"],
    ...over,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const one of Array.isArray(v) ? v : [v]) fd.append(k, one);
  return fd;
}

describe("parseEditForm", () => {
  it("turns the one-per-line fields into lists and drops empty lines", () => {
    const r = parseEditForm(form());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.edit.template.expectedOutputs).toEqual(["audit.md with sections Ownership, Filings", "a short report"]);
    expect(r.edit.template.steps).toEqual(["Search the web for {input}", "Read the filings", "Write audit.md"]);
  });

  it("reads a list sent as one field per row (the editable lists) as one item per field, dropping empty rows", () => {
    const r = parseEditForm(form({ steps: ["Search the web for {input}", "  ", "Write audit.md"], expectedOutputs: ["audit.md", "a short report"] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.edit.template.steps).toEqual(["Search the web for {input}", "Write audit.md"]);
    expect(r.edit.template.expectedOutputs).toEqual(["audit.md", "a short report"]);
    expect(r.values.steps).toBe("Search the web for {input}\n\nWrite audit.md"); // what was typed, row by row, for a refused save
  });

  it("collects the ticked connections", () => {
    const r = parseEditForm(form({ connections: ["DeepWiki", "GitHub"] }));
    expect(r.ok && r.edit.template.connections).toEqual(["DeepWiki", "GitHub"]);
  });

  it("uses the one-line description as the template's intent, so the two cannot drift apart", () => {
    const r = parseEditForm(form());
    expect(r.ok && r.edit.template.intent).toBe("Audits a company");
  });

  it("normalises the command, and takes it with or without the slash it is called with", () => {
    const r = parseEditForm(form({ command: "/Audit" }));
    expect(r.ok && r.edit.command).toBe("audit");
  });

  it("reports missing {input} under the instructions field", () => {
    const r = parseEditForm(form({ instructions: "Audit Acme and write audit.md." }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors["template.instructions"]).toMatch(/\{input\}/);
  });

  it("reports a command that is not a command under the command field", () => {
    const r = parseEditForm(form({ command: "a b" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.command).toBeTruthy();
  });

  it("reports an empty step list under the steps field", () => {
    const r = parseEditForm(form({ steps: "\n  \n" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors["template.steps"]).toMatch(/at least one step/i);
  });

  it("returns what was typed with the errors, so a refused form keeps its text", () => {
    const r = parseEditForm(form({ name: "", instructions: "no placeholder here" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.values.instructions).toBe("no placeholder here");
    expect(r.values.steps).toContain("Read the filings");
    expect(r.values.connections).toEqual(["DeepWiki"]);
    expect(r.fieldErrors.name).toBeTruthy();
  });
});

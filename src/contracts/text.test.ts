import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FollowUpInput, StartRunInput } from "./agent";
import { AutomationEdit, HumanVerdictInput } from "./automation";
import { NewConnection } from "./connection";
import { NUL_REFUSED, noNul } from "./text";

// QA F1: a NUL byte reached Postgres, which refuses it in text: POST /api/runs answered an empty 500, the Home box and an
// example said "Something went wrong on our side", and creating a workspace crashed. Refused at the boundary instead.
const NUL = "\u0000";

describe("noNul", () => {
  it("refuses text with a NUL byte in plain words", () => {
    const parsed = noNul(z.string()).safeParse(`Say hello ${NUL} world`);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].message).toBe(NUL_REFUSED);
  });

  it("lets ordinary text through, other control characters (tabs, new lines) included", () => {
    expect(noNul(z.string()).parse("line one\n\tline two")).toBe("line one\n\tline two");
  });

  it("says what to do in words an office worker knows, without naming a byte", () => {
    expect(NUL_REFUSED).not.toMatch(/nul|byte|\\u0000|0x00/i);
  });
});

describe("every text a run starts from refuses a NUL byte", () => {
  it("the instructions of a new run", () => {
    expect(StartRunInput.safeParse({ prompt: `Fetch the news ${NUL} please` }).error?.issues[0].message).toBe(NUL_REFUSED);
  });

  it("the change asked for in a follow-up", () => {
    expect(FollowUpInput.safeParse({ runId: crypto.randomUUID(), prompt: `Add a ${NUL} column` }).error?.issues[0].message).toBe(NUL_REFUSED);
  });
});

describe("the automation editor, the judgment and the connection form refuse a NUL byte", () => {
  const edit = {
    name: "Company audit",
    command: "audit",
    description: "",
    inputLabel: "Company",
    inputHint: "",
    inputExample: "",
    template: { instructions: "Audit {input} and write audit.md", intent: "", expectedOutputs: ["audit.md"], outputFormat: "", steps: ["Search"], connections: [] },
  };

  it.each([
    ["the name", { ...edit, name: `Audit${NUL}` }],
    ["the input's hint", { ...edit, inputHint: `e.g.${NUL}` }],
    ["the instructions", { ...edit, template: { ...edit.template, instructions: `Audit {input}${NUL} and write it` } }],
    ["a step", { ...edit, template: { ...edit.template, steps: [`Search${NUL}`] } }],
    ["an output", { ...edit, template: { ...edit.template, expectedOutputs: [`audit${NUL}.md`] } }],
  ])("the editor refuses one in %s", (_where, value) => {
    expect(AutomationEdit.safeParse(value).error?.issues[0].message).toBe(NUL_REFUSED);
  });

  it("a judgment's note", () => {
    expect(HumanVerdictInput.safeParse({ runId: crypto.randomUUID(), verdict: "approved", note: `ok${NUL}` }).error?.issues[0].message).toBe(NUL_REFUSED);
  });

  it("a connection's token", () => {
    const parsed = NewConnection.safeParse({ name: "Linear", url: "https://mcp.linear.app/mcp", token: `abc${NUL}def` });
    expect(parsed.error?.issues[0].message).toBe(NUL_REFUSED);
  });
});

import { describe, expect, it } from "vitest";
import { fileKind, flagLine } from "./file-kind";

describe("fileKind - how a file is shown on the run", () => {
  it("previews a chart, cards a spreadsheet and lists everything else as a document", () => {
    expect(fileKind("sales.svg")).toBe("chart");
    expect(fileKind("Report.XLSX")).toBe("spreadsheet");
    expect(fileKind("output.csv")).toBe("document");
    expect(fileKind("notes.md")).toBe("document");
  });
});

describe("flagLine - what the output scan found, in one line", () => {
  it("lists the personal data it counted", () => {
    expect(flagLine([{ kind: "email", count: 12, detail: "12 email addresses" }])).toBe("Contains 12 email addresses");
    expect(
      flagLine([
        { kind: "email", count: 12, detail: "12 email addresses" },
        { kind: "phone", count: 1, detail: "1 phone number" },
        { kind: "iban", count: 2, detail: "2 IBANs" },
      ]),
    ).toBe("Contains 12 email addresses, 1 phone number and 2 IBANs");
  });

  it("leaves credentials out: a file with a key is held back and says so itself", () => {
    expect(flagLine([{ kind: "credential", count: 1, detail: "an API key on line 4" }])).toBeNull();
  });

  it("is null for a file with no flags", () => {
    expect(flagLine([])).toBeNull();
    expect(flagLine(undefined)).toBeNull();
  });
});

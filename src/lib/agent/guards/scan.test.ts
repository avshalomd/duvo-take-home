import { describe, expect, it } from "vitest";
import { countCards, countEmails, countIbans, countPhones } from "./personal-data";
import { scanOutput } from "./scan";

// The output scan runs on every file before it is stored. A credential quarantines the file; personal data is only
// counted and shown on the file card, because a CSV of contacts is often exactly what the task asked for.
const text = (name: string, content: string) => ({ name, content, encoding: "utf8" as const });
const apiKey = ["sk-", "ant-api03-", "aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5bC7dE9"].join(""); // assembled: see write.test.ts

describe("scanOutput: credentials quarantine the file", () => {
  it("quarantines a file holding an API key and says where it is", () => {
    const out = scanOutput(text("notes.md", `# Notes\n\nkey: ${apiKey}\n`));
    expect(out.quarantined).toBe(true);
    expect(out.flags).toEqual([{ kind: "credential", count: 1, detail: "an API key on line 3" }]);
  });

  it("counts several credentials in one flag", () => {
    const out = scanOutput(text("env.txt", `A=${apiKey}\nB=${apiKey}x`));
    expect(out.flags).toEqual([{ kind: "credential", count: 2, detail: "2 credentials, the first an API key on line 1" }]);
  });

  it("leaves a clean file alone", () => {
    expect(scanOutput(text("output.csv", "title,url\nA,https://example.com/a\n"))).toEqual({ flags: [], quarantined: false });
  });
});

describe("scanOutput: personal data is counted, never quarantined", () => {
  it("counts distinct email addresses in a plain sentence", () => {
    const out = scanOutput(text("contacts.csv", "name,email\nAda,ada@example.com\nBob,bob@example.org\nCy,cy@mail.example.co.uk\nAda again,ADA@example.com\n"));
    expect(out.quarantined).toBe(false);
    expect(out.flags).toEqual([{ kind: "email", count: 3, detail: "3 email addresses" }]);
  });

  it("says 1 email address in the singular", () => {
    expect(scanOutput(text("a.txt", "write to ada@example.com")).flags).toEqual([{ kind: "email", count: 1, detail: "1 email address" }]);
  });

  it("does not take an image name such as logo@2x.png for an email address", () => {
    expect(countEmails("<img src='logo@2x.png'> and icon@3x.jpg")).toBe(0);
  });

  it("reports every kind it finds in one file, in a fixed order", () => {
    const content = "ada@example.com, +44 20 7946 0958, 4111 1111 1111 1111, GB82 WEST 1234 5698 7654 32";
    expect(scanOutput(text("mix.txt", content)).flags.map((f) => f.kind)).toEqual(["email", "phone", "card", "iban"]);
  });

  it("does not scan a base64 file (.xlsx): its cells are compressed inside a zip", () => {
    const xlsx = { name: "out.xlsx", content: Buffer.from("ada@example.com " + apiKey).toString("base64"), encoding: "base64" as const };
    expect(scanOutput(xlsx)).toEqual({ flags: [], quarantined: false });
  });
});

describe("phone numbers", () => {
  it.each([
    ["an international UK number", "+44 20 7946 0958"],
    ["an international US number", "+1 (555) 123-4567"],
    ["an international number without spaces", "+447700900123"],
    ["a US number with an area code in brackets", "(555) 123-4567"],
    ["a US number with dashes", "555-123-4567"],
    ["a US number with dots", "555.123.4567"],
    ["a UK national number", "020 7946 0958"],
    ["a German national number", "030 12345678"],
    ["a French number in pairs", "01 23 45 67 89"],
  ])("counts %s", (_what, value) => {
    expect(countPhones(`call ${value} today`)).toBe(1);
  });

  it.each([
    ["an ISO date with a time", "2024-01-15 10:30"],
    ["a European date with a time", "15.01.2024 12:30"],
    ["a US date", "01/02/2024"],
    ["a version number", "v10.4.12"],
    ["a four-part version number", "10.12.1234.5678"],
    ["an IP address", "192.168.100.200"],
    ["an order id in groups of four", "1234-5678-9012"],
    ["a year range", "2023-2024"],
    ["a price", "1,234,567.89"],
  ])("does not take %s for a phone number", (_what, value) => {
    expect(countPhones(`see ${value} here`)).toBe(0);
  });

  it("counts the same number written twice once", () => {
    expect(countPhones("+44 20 7946 0958 or +44 20 7946 0958")).toBe(1);
  });
});

describe("payment card numbers", () => {
  it.each([
    ["a Visa test number with spaces", "4111 1111 1111 1111"],
    ["a Visa test number with dashes", "4111-1111-1111-1111"],
    ["a Mastercard test number without spaces", "5555555555554444"],
    ["an Amex test number", "378282246310005"],
  ])("counts %s that passes the Luhn check", (_what, value) => {
    expect(countCards(`paid with ${value}.`)).toBe(1);
  });

  it("does not count a 16-digit order id that fails the Luhn check", () => {
    expect(countCards("Order 1234567812345678 shipped")).toBe(0);
  });

  it("does not count a number inside a longer run of digits", () => {
    expect(countCards("id 4111111111111111000000")).toBe(0);
  });
});

describe("IBANs", () => {
  it.each([
    ["a British IBAN in groups", "GB82 WEST 1234 5698 7654 32"],
    ["a German IBAN without spaces", "DE89370400440532013000"],
  ])("counts %s whose mod-97 checksum holds", (_what, value) => {
    expect(countIbans(`pay to ${value} please`)).toBe(1);
  });

  it("does not count an IBAN with a bad checksum", () => {
    expect(countIbans("pay to GB83 WEST 1234 5698 7654 32 please")).toBe(0);
  });

  it("does not take an ordinary code for an IBAN", () => {
    expect(countIbans("flight AB12 CDEF and part XY99ZZZZ")).toBe(0);
  });
});

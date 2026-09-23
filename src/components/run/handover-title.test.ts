import { describe, expect, it } from "vitest";
import { handoverTitle } from "./handover-title";

const ready = [{ command: "audit", name: "Company audit" }];

// Q138: the brief moves into the new run's title on the press, before the server has answered. So the title is
// worked out in the browser, the way the run page will name the run, and only for a start the server will accept.
describe("handoverTitle - the new run's title, known at the press", () => {
  it("is the first line of plain instructions, as the run page names the run", () => {
    expect(handoverTitle("  List three facts about the Moon \nwith sources", ready)).toBe("List three facts about the Moon");
  });

  it("is the automation's name and the input for a ready command", () => {
    expect(handoverTitle("/audit Acme Ltd", ready)).toBe("Company audit: Acme Ltd");
    expect(handoverTitle("/AUDIT  Acme Ltd ", ready)).toBe("Company audit: Acme Ltd");
  });

  it("is null for what the server refuses before a run exists, so nothing moves only to come back", () => {
    expect(handoverTitle("   ", ready)).toBeNull(); // empty
    expect(handoverTitle("do it", ready)).toBeNull(); // too short to be instructions
    expect(handoverTitle("/nope Acme Ltd", ready)).toBeNull(); // no such ready automation
    expect(handoverTitle("/audit", ready)).toBeNull(); // a ready automation, but no input
  });
});

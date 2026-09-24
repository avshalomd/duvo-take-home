import { describe, expect, it } from "vitest";
import { nextFreeCommand, parseCommand, toCommandName, unknownCommandRefusal } from "./command";

describe("parseCommand", () => {
  it("reads a slash command and the rest of the line as its input", () => {
    expect(parseCommand("/audit Apple Inc.")).toEqual({ command: "audit", input: "Apple Inc." });
  });

  it("reads text that starts with a backslash as plain text, not a command (his call: the front slash only)", () => {
    expect(parseCommand("\\audit Apple Inc.")).toBeNull();
  });

  it("keeps the spaces inside the input and trims the ends", () => {
    expect(parseCommand("/audit   Acme Holdings Ltd  ")).toEqual({ command: "audit", input: "Acme Holdings Ltd" });
  });

  it("reads a bare command as a command with an empty input", () => {
    expect(parseCommand("/audit")).toEqual({ command: "audit", input: "" });
  });

  it("lower-cases the command, since commands are stored lower-case", () => {
    expect(parseCommand("/Audit Apple")).toEqual({ command: "audit", input: "Apple" });
  });

  it("reads a command with a dash in it", () => {
    expect(parseCommand("/ai-news robotics")).toEqual({ command: "ai-news", input: "robotics" });
  });

  it("keeps a multi-line input whole", () => {
    expect(parseCommand("/audit Apple Inc.\nfocus on filings")).toEqual({ command: "audit", input: "Apple Inc.\nfocus on filings" });
  });

  it("answers null for plain text", () => {
    expect(parseCommand("Fetch the latest AI news")).toBeNull();
  });

  it("answers null when the prefix is in the middle of the text", () => {
    expect(parseCommand("please run /audit Apple Inc.")).toBeNull();
  });

  it("answers null for a prefix with no name after it", () => {
    expect(parseCommand("/ Apple")).toBeNull();
    expect(parseCommand("/")).toBeNull();
  });

  // QA F14, his call (2026-09-24): "/über test", "/2024-report x" and "/audit, Apple" became paid free-text runs. Any
  // text that starts with "/" and a character that is not a space is a command, which is refused if there is none.
  it.each([
    ["/über test", "über", "test"],
    ["/2024-report x", "2024-report", "x"],
    ["/audit, Apple", "audit,", "Apple"],
    ["/usr/bin is where it lives", "usr/bin", "is where it lives"],
    ["/Ünïcode", "ünïcode", ""],
  ])("reads %j as a command, even one no automation can be called", (text, command, input) => {
    expect(parseCommand(text)).toEqual({ command, input });
  });
});

describe("unknownCommandRefusal", () => {
  it("refuses a name no automation can have, in plain words, without looking anything up", () => {
    expect(unknownCommandRefusal("über")).toBe("There's no /über command.");
    expect(unknownCommandRefusal("audit,")).toBe("There's no /audit, command.");
    expect(unknownCommandRefusal("usr/bin")).toBe("There's no /usr/bin command.");
  });

  it("leaves a name an automation could have to the lookup, which says whether it exists", () => {
    expect(unknownCommandRefusal("audit")).toBeNull();
    expect(unknownCommandRefusal("ai-news")).toBeNull();
  });
});

describe("toCommandName", () => {
  it("keeps a valid command as it is", () => {
    expect(toCommandName("audit")).toBe("audit");
  });

  it("turns what a model may write into a valid command", () => {
    expect(toCommandName("/Company Audit")).toBe("company-audit");
    expect(toCommandName("/AI news!")).toBe("ai-news");
  });

  it("drops leading digits, since a command starts with a letter", () => {
    expect(toCommandName("10k-summary")).toBe("k-summary");
  });

  it("cuts a long name to 24 characters without a trailing dash", () => {
    const c = toCommandName("a very long automation name that goes on");
    expect(c.length).toBeLessThanOrEqual(24);
    expect(c).toMatch(/^[a-z][a-z0-9-]*[a-z0-9]$/);
  });

  it("falls back to 'automation' when nothing usable is left", () => {
    expect(toCommandName("!!")).toBe("automation");
    expect(toCommandName("x")).toBe("automation");
  });
});

describe("nextFreeCommand", () => {
  it("keeps the command when nobody has it", () => {
    expect(nextFreeCommand("audit", ["news"])).toBe("audit");
  });

  it("numbers a taken command -2, then -3", () => {
    expect(nextFreeCommand("audit", ["audit"])).toBe("audit-2");
    expect(nextFreeCommand("audit", ["audit", "audit-2"])).toBe("audit-3");
  });

  it("stays within 24 characters when it adds the number", () => {
    const base = "abcdefghijklmnopqrstuvwx"; // 24 characters
    expect(nextFreeCommand(base, [base])).toBe("abcdefghijklmnopqrstuv-2");
  });
});

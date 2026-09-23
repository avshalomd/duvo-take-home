import { describe, expect, it } from "vitest";
import { applyCommand, commandQuery, commandWord, filterAutomations } from "./command-query";

// Commands use a front slash only, "/audit Apple Inc.", as in coding agents (his call, 2026-09-23).

describe("commandQuery - what the composer's automation list filters on", () => {
  it("opens on a bare / at the start of the box", () => {
    expect(commandQuery("/")).toBe("");
  });

  it("returns the partial command as it is typed, in lower case", () => {
    expect(commandQuery("/aud")).toBe("aud");
    expect(commandQuery("/Aud")).toBe("aud");
    expect(commandQuery("/weekly-ne")).toBe("weekly-ne");
  });

  it("closes once the command is followed by a space: the rest of the line is the input", () => {
    expect(commandQuery("/audit ")).toBeNull();
    expect(commandQuery("/audit Acme Ltd")).toBeNull();
    expect(commandQuery("/audit\nAcme")).toBeNull();
  });

  it("stays closed for plain text, for a / anywhere but the start, and for a backslash, which is plain text", () => {
    expect(commandQuery("")).toBeNull();
    expect(commandQuery("Fetch the latest AI news")).toBeNull();
    expect(commandQuery("save it as a/b")).toBeNull();
    expect(commandQuery("\\")).toBeNull();
    expect(commandQuery("\\aud")).toBeNull();
  });

  it("stays closed for a word that cannot be a command", () => {
    expect(commandQuery("/1st")).toBeNull();
    expect(commandQuery("/au!")).toBeNull();
    expect(commandQuery("//")).toBeNull();
  });
});

describe("applyCommand - choosing an automation from the list", () => {
  it("replaces the partial command with the full one and a space, ready for the input", () => {
    expect(applyCommand("/au", "audit")).toBe("/audit ");
    expect(applyCommand("/", "audit")).toBe("/audit ");
  });
});

describe("commandWord - the command a text asks for, before anything checks that it exists", () => {
  it("reads the word after a leading /", () => {
    expect(commandWord("/audit Acme Ltd")).toBe("audit");
    expect(commandWord("/Audit Acme Ltd")).toBe("audit");
    expect(commandWord("/nope-e2e")).toBe("nope-e2e");
  });

  it("is null for plain text, a backslash, and a word that does not start with a letter", () => {
    expect(commandWord("Fetch the news")).toBeNull();
    expect(commandWord("\\audit Acme")).toBeNull();
    expect(commandWord("/ audit")).toBeNull();
    expect(commandWord("/1st")).toBeNull();
  });
});

describe("filterAutomations - the list under the box", () => {
  const list = [
    { command: "audit", name: "Company audit" },
    { command: "news", name: "Weekly AI news" },
    { command: "digest", name: "DeepWiki digest" },
  ];

  it("shows every automation for a bare prefix", () => {
    expect(filterAutomations(list, "").map((a) => a.command)).toEqual(["audit", "news", "digest"]);
  });

  it("puts the commands that start with what was typed first, then the names that contain it", () => {
    expect(filterAutomations(list, "d").map((a) => a.command)).toEqual(["digest", "audit"]);
    expect(filterAutomations(list, "wiki").map((a) => a.command)).toEqual(["digest"]);
  });

  it("is empty when nothing matches", () => {
    expect(filterAutomations(list, "zzz")).toEqual([]);
  });
});

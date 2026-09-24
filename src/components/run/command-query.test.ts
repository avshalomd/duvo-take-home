import { describe, expect, it } from "vitest";
import { applyCommand, commandHint, commandQuery, describeOutput, emptyListLine, filterAutomations } from "./command-query";

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

// Q93: after "/news-digest " the box gave no hint of what to type next
describe("commandHint - what to type after a chosen command", () => {
  const ready = [{ command: "audit", hint: "Company name, e.g. Apple Inc." }];

  it("shows the automation's input hint once the command and a space are typed", () => {
    expect(commandHint("/audit ", ready)).toBe("Company name, e.g. Apple Inc.");
    expect(commandHint("/Audit  ", ready)).toBe("Company name, e.g. Apple Inc.");
  });

  it("goes away as soon as the input is typed, and is never shown for an unknown command, a backslash or plain text", () => {
    expect(commandHint("/audit A", ready)).toBeNull();
    expect(commandHint("/audit", ready)).toBeNull(); // still choosing: the list is open
    expect(commandHint("/nope ", ready)).toBeNull();
    expect(commandHint("\\audit ", ready)).toBeNull();
    expect(commandHint("Fetch the news ", ready)).toBeNull();
  });
});

// Q117: a workspace whose automations were all off or drafts was told it had none
describe("emptyListLine - what the command list says when it has nothing to offer", () => {
  it("says there are none yet, and how to make one", () => {
    expect(emptyListLine({ ready: 0, notReady: 0, query: "" })).toBe("No saved automations yet - make one from a finished run");
  });

  it("says none is ready when there are drafts or switched-off ones", () => {
    expect(emptyListLine({ ready: 0, notReady: 2, query: "" })).toBe("None of your 2 automations is ready yet - approve or turn one on in Automations");
    expect(emptyListLine({ ready: 0, notReady: 1, query: "" })).toBe("Your automation is not ready yet - approve or turn it on in Automations");
  });

  it("names what was typed when ready ones exist but none matches", () => {
    expect(emptyListLine({ ready: 3, notReady: 0, query: "zz" })).toBe("No ready automation starts with /zz");
  });
});

// Q118: "makes facts.md with three facts about {input}" showed the template's placeholder
describe("describeOutput - an automation's output line in plain words, with its input named", () => {
  it("puts the input's label where the template says {input}", () => {
    expect(describeOutput("facts.md with three facts about {input}", "Topic")).toBe("a document with three facts about the topic");
  });

  it("says what kind of file it makes rather than the file's name", () => {
    expect(describeOutput("news.csv with 8 rows", "Topic")).toBe("a CSV table with 8 rows");
    expect(describeOutput("chart.svg of the counts", "Topic")).toBe("a chart of the counts");
    expect(describeOutput("data.xlsx with one sheet per region", "Topic")).toBe("a spreadsheet with one sheet per region");
  });

  // the list read "Makes output.csv with columns title, source, url, published_at, summary, at least 8 rows, ..."
  it("leaves out the column names and the fine print after the first comma", () => {
    const spec = "output.csv with columns title, source, url, published_at, summary, at least 8 rows, all dated within the last 7 days, no duplicate urls";
    expect(describeOutput(spec, "News topic")).toBe("a CSV table");
    expect(describeOutput("news.csv with 8 rows, all dated this week", "Topic")).toBe("a CSV table with 8 rows");
  });

  it("leaves a line that names no file as it is", () => {
    expect(describeOutput("a short answer in the report", "Topic")).toBe("a short answer in the report");
  });
});

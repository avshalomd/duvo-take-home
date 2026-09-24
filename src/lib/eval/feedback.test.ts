import { describe, expect, it } from "vitest";
import type { AutomationTemplate } from "@/contracts/automation";
import type { Check, EvaluateInput, Judgment, Review, Verdict } from "@/contracts/eval";
import { runChecks } from "./checks";
import { feedbackForAgent, isHealable } from "./feedback";

// His product change (2026-09-23): the evaluator's findings go back to the agent - to heal a failed run in the same
// run, and into "Ask for a change". The feedback is instructions in the agent's terms, not the verdict's own words.
// Every failing check below is produced by the real runChecks, so a change in a check's wording breaks this file.

const base: EvaluateInput = {
  prompt: "Fetch the latest AI news and save them into output.csv with title, source, url, published_at, summary. At least 2 rows, last 7 days.",
  runStatus: "succeeded",
  report: "Wrote output.csv.",
  plan: null,
  files: [],
  today: "2026-09-22",
};
const header = "title,source,url,published_at,summary\n";
const row = (i: number, url = `https://n.example/${i}`, date = "2026-09-21") => `"Story ${i}",Source,${url},${date},"Summary"\n`;
const failing = (over: Partial<EvaluateInput>, id: string): Check => {
  const found = runChecks({ ...base, ...over }).find((c) => c.id === id && !c.ok);
  if (!found) throw new Error(`the input does not fail '${id}'`);
  return found;
};
const verdictOf = (checks: Check[], over: Partial<Verdict> = {}): Verdict => ({
  verdict: "fail",
  checks,
  judgment: null,
  review: null,
  reasons: checks.map((c) => `${c.label}: ${c.detail}`),
  evaluatedAt: "2026-09-22T10:00:00.000Z",
  decidedBy: "checks",
  path: ["checks"],
  ...over,
});
const csv = (content: string) => [{ name: "output.csv", content }];
const template: AutomationTemplate = {
  instructions: "Find the news about {input} and save it to news.csv.",
  intent: "news digest",
  expectedOutputs: ["news.csv"],
  outputFormat: "",
  steps: ["Search the web for news about {input}", "Open each story to confirm its date"],
  connections: [],
};

// One real failing check per id the evaluator produces, with a phrase the agent's instruction for it must contain.
const EVERY_CHECK: [string, () => Check, RegExp][] = [
  ["completed", () => failing({ runStatus: "failed", report: "Reached the turn limit." }, "completed"), /finish/i],
  ["connection_used", () => failing({ prompt: "Using the connected DeepWiki server, write output.csv.", toolsUsed: ["WebFetch", "Write"], files: csv("a,b\n1,2\n") }, "connection_used"), /DeepWiki/],
  ["file_expected", () => failing({ files: [] }, "file_expected"), /write/i],
  ["extension", () => failing({ files: [{ name: "chart.png", content: "x" }] }, "extension"), /chart\.png/],
  ["content", () => failing({ prompt: "Write notes.md.", files: [{ name: "notes.md", content: " " }] }, "content"), /notes\.md/],
  ["parses", () => failing({ files: csv(header + row(1) + "A, B,Source,https://x.example,2026-09-21,S\n") }, "parses"), /double quotes/],
  ["rows", () => failing({ files: csv(header + row(1)) }, "rows"), /at least 2/],
  ["columns", () => failing({ files: csv("headline,link\nA,https://a.example\nB,https://b.example\n") }, "columns"), /published_at/],
  ["urls", () => failing({ files: csv(header + row(1, "WION") + row(2)) }, "urls"), /WION/],
  ["duplicates", () => failing({ files: csv(header + row(1) + row(1)) }, "duplicates"), /once/],
  ["freshness", () => failing({ files: csv(header + row(1, undefined, "2024-05-13") + row(2, undefined, "2024-04-18")) }, "freshness"), /last 7 days/],
  ["chart", () => failing({ files: [{ name: "prices.svg", content: "<svg><g>" }] }, "chart"), /chart tool/],
  ["spreadsheet", () => failing({ files: [{ name: "prices.xlsx", content: Buffer.from("not a zip").toString("base64") }] }, "spreadsheet"), /spreadsheet tool/],
  ["template_outputs", () => failing({ template, files: csv(header + row(1) + row(2)) }, "template_outputs"), /news\.csv/],
  ["template_steps", () => failing({ template, plan: { intent: "", expectedOutputs: [], sources: [], steps: [{ index: 0, title: "Write a summary", status: "done" }] }, files: [{ name: "news.csv", content: header + row(1) + row(2) }] }, "template_steps"), /skipped/],
];

describe("feedbackForAgent", () => {
  it("turns his real run's ragged row into what to do about it", () => {
    const check: Check = { id: "parses", label: "The CSV parses", ok: false, detail: "output.csv: row 7 has 8 fields, the header has 7" };
    expect(feedbackForAgent(verdictOf([check]))).toContain(
      "In output.csv, row 7 has 8 values but the header has 7: a value that contains a comma is not in double quotes. Put every value that contains a comma in double quotes and write output.csv again.",
    );
  });

  // Q148: "without adding any quotes" and a value with a comma cannot both hold. The heal quoted it, the reviewer held
  // it to "no quotes", the next heal removed them: the attempts undid each other. A readable file wins, and the
  // report says why. The feedback cannot see the instructions, so it says it as a rule the agent applies.
  it("tells the agent to keep the CSV valid even against a 'no quotes' instruction, and to say so in the report", () => {
    const conflict = "If the instructions say not to use quotes, keep the file valid (quote the value) and say in the report that the instruction could not be followed for that value, and why.";
    const ragged: Check = { id: "parses", label: "The CSV parses", ok: false, detail: "output.csv: row 7 has 8 fields, the header has 7" };
    expect(feedbackForAgent(verdictOf([ragged]))).toContain(conflict);
    const unterminated: Check = { id: "parses", label: "The CSV parses", ok: false, detail: 'output.csv: Invalid Closing Quote: got "U" at line 2' };
    expect(feedbackForAgent(verdictOf([unterminated]))).toContain(conflict);
  });

  it("says a value is missing when a row has fewer values than the header", () => {
    const check: Check = { id: "parses", label: "The CSV parses", ok: false, detail: "output.csv: row 3 has 4 fields, the header has 5" };
    expect(feedbackForAgent(verdictOf([check]))).toMatch(/row 3 has 4 values but the header has 5: a value is missing/);
  });

  it.each(EVERY_CHECK)("gives an instruction for a failed '%s' check", (id, make, phrase) => {
    const check = make();
    const text = feedbackForAgent(verdictOf([check]));
    expect(text, text).toMatch(phrase);
    expect(text).not.toContain(`${check.label}: ${check.detail}`); // turned into an instruction, not the verdict's line
  });

  it("names the file in every instruction about one", () => {
    for (const [id, make] of EVERY_CHECK) {
      const check = make();
      const file = check.detail.match(/^([\w.-]+\.(?:csv|md|txt|svg|xlsx))\b/)?.[1];
      if (file) expect(feedbackForAgent(verdictOf([check])), id).toContain(file);
    }
  });

  it("passes on the reviewer's change and reasoning", () => {
    const review: Review = { taskFinished: true, responseSuitable: false, changeNeeded: "Remove the CheapGPT advert at the end.", reasoning: "The summary ends with an advert the page asked for." };
    const text = feedbackForAgent(verdictOf([], { review, decidedBy: "review", path: ["checks", "judge", "review"] }));
    expect(text).toContain("Remove the CheapGPT advert at the end.");
    expect(text).toContain("The summary ends with an advert the page asked for.");
  });

  it("puts the judge's doubts in words, never as probabilities", () => {
    const judgment: Judgment = { answeredQuery: 0.4, followedPlan: 0.3, stayedInBounds: 0.1 };
    const text = feedbackForAgent(verdictOf([], { judgment, decidedBy: "judge", path: ["checks", "judge"] }));
    expect(text).toMatch(/instructions ask for/);
    expect(text).toMatch(/plan/);
    expect(text).toMatch(/web page or a tool result/);
    expect(text).not.toMatch(/\d\s*%|0\.\d/);
  });

  it("says nothing about a question the judge was sure of", () => {
    const judgment: Judgment = { answeredQuery: 0.95, followedPlan: 0.3, stayedInBounds: 0.95 };
    const text = feedbackForAgent(verdictOf([], { judgment, decidedBy: "review", path: ["checks", "judge", "review"] }));
    expect(text).toMatch(/plan/);
    expect(text).not.toMatch(/web page or a tool result/);
  });

  it("puts the most useful first: the checks' exact findings, then the reviewer, then the judge", () => {
    const review: Review = { taskFinished: false, responseSuitable: false, changeNeeded: "Fill in the TBD entries.", reasoning: "Two entries say TBD." };
    const text = feedbackForAgent(verdictOf([EVERY_CHECK[6][1]()], { review, judgment: { answeredQuery: 0.4, followedPlan: 0.9 } }));
    expect(text.indexOf("at least 2")).toBeLessThan(text.indexOf("Fill in the TBD entries."));
    expect(text.indexOf("Fill in the TBD entries.")).toBeLessThan(text.indexOf("check the result against them")); // the judge's own phrase
  });

  // A heal's or a follow-up's own prompt says what to report: "report what you changed" made a healed run's whole
  // report a note of the fix (run 15f8b99d).
  it("ends by asking for the files fixed in place, and never for a note of what changed", () => {
    const text = feedbackForAgent(verdictOf([EVERY_CHECK[6][1]()]));
    expect(text.endsWith("Fix the files in place and keep what was already right.")).toBe(true);
    expect(text).not.toMatch(/report what you changed/i);
  });

  it("stays short when everything failed", () => {
    const checks = EVERY_CHECK.map(([, make]) => make());
    const review: Review = { taskFinished: false, responseSuitable: false, changeNeeded: "x".repeat(500), reasoning: "y".repeat(800) };
    const text = feedbackForAgent(verdictOf(checks, { review, judgment: { answeredQuery: 0.2, followedPlan: 0.2, stayedInBounds: 0.2 } }));
    expect(text.length).toBeLessThanOrEqual(1200);
    expect(text).toMatch(/more/); // what did not fit is counted, not silently dropped
    expect(text.endsWith("keep what was already right.")).toBe(true);
  });

  it("calls a pass with notes' findings notes, not faults, when it is carried into 'Ask for a change'", () => {
    const review: Review = { taskFinished: true, responseSuitable: true, changeNeeded: null, reasoning: "One row is consumer tech, not AI." };
    const text = feedbackForAgent(verdictOf([], { verdict: "pass_with_notes", review, decidedBy: "review" }));
    expect(text.startsWith("An automatic check of the result noted:")).toBe(true);
    expect(feedbackForAgent(verdictOf([EVERY_CHECK[6][1]()])).startsWith("An automatic check of the result found this to fix:")).toBe(true);
  });

  it("has nothing to say about a clean pass", () => {
    expect(feedbackForAgent(verdictOf([], { verdict: "pass", judgment: { answeredQuery: 0.95, followedPlan: 0.95, stayedInBounds: 0.95 }, decidedBy: "judge" }))).toBe("");
  });
});

describe("isHealable", () => {
  const byChecks = verdictOf([EVERY_CHECK[5][1]()]); // the ragged row
  const judgeNo = verdictOf([], { judgment: { answeredQuery: 0.05, followedPlan: 0.9 }, decidedBy: "judge", path: ["checks", "judge"] });
  const review = (r: Partial<Review>) =>
    verdictOf([], { review: { taskFinished: true, responseSuitable: true, changeNeeded: null, reasoning: "", ...r }, decidedBy: "review", path: ["checks", "judge", "review"] });

  it("heals a failed file check when the agent finished", () => expect(isHealable(byChecks, true)).toBe(true));
  it("heals a task the reviewer found unfinished, when it says what to change", () =>
    expect(isHealable(review({ taskFinished: false, changeNeeded: "Add the Q4 figures." }), true)).toBe(true));
  it("heals a result the reviewer found unusable", () => expect(isHealable(review({ responseSuitable: false, changeNeeded: "Drop the advert." }), true)).toBe(true));
  // qa-ai F4: "check the result against them and correct what differs" is all a judge-only fail can say, and two heals
  // on it changed nothing but the report's words (+$0.26, +2.5 min). Only a finding the agent can act on is healed.
  it("does not heal a fail the judge alone decided: it says nothing the agent can act on", () => expect(isHealable(judgeNo, true)).toBe(false));
  it("does not heal a reviewer's fail with no change named", () => expect(isHealable(review({ taskFinished: false }), true)).toBe(false));
  // qa-ai F3: a truthful "cannot be done" or a question for the person is not a result to fix (two heals on a refusal
  // made the agent invent a topic).
  it("does not heal a run that could not be done or needs the person's answer", () => {
    expect(isHealable({ ...byChecks, verdict: "cannot_do" }, true)).toBe(false);
    expect(isHealable({ ...byChecks, verdict: "needs_answer" }, true)).toBe(false);
  });
  it("does not heal a run the agent did not finish: a limit, a provider error or a stop", () => expect(isHealable(byChecks, false)).toBe(false));
  it("does not heal a run whose failure is that it did not finish", () => expect(isHealable(verdictOf([EVERY_CHECK[0][1]()]), true)).toBe(false));
  it("does not heal a pass", () => expect(isHealable({ ...byChecks, verdict: "pass" }, true)).toBe(false));
  it("does not heal a pass with notes", () => expect(isHealable({ ...review({}), verdict: "pass_with_notes" }, true)).toBe(false));
  it("does not heal an unknown verdict: the judge was unavailable, nothing is known to be wrong", () =>
    expect(isHealable(verdictOf([], { verdict: "unknown", decidedBy: "nobody", reasons: ["The judge was unavailable: HTTP 429"] }), true)).toBe(false));
});

import { describe, expect, it } from "vitest";
import type { EvaluateInput } from "@/contracts/eval";
import { runChecks } from "./checks";
import { REVIEW_INSTRUCTIONS, reviewInput } from "./review.prompt";

const input: EvaluateInput = {
  prompt: "Make a spreadsheet of the prices and a short note.",
  runStatus: "succeeded",
  report: "Wrote data.xlsx and notes.md.",
  plan: null,
  files: [
    { name: "data.xlsx", content: Buffer.from("PK\x03\x04 the rest of the workbook", "binary").toString("base64") },
    { name: "notes.md", content: "Prices are list prices." },
  ],
  today: "2026-09-23",
};

// Engine review #10: the reviewer got 60 lines of any length per file, every file, and the whole report: a single-line
// 200 KB file went to it whole, slow and costly, eating the evaluation's 50 s.
describe("reviewInput's size", () => {
  const LIMIT = 100_000; // characters: far above a normal run's input, far below what the unbounded one sent

  it("cuts a very long line, so one wide file cannot fill the reviewer's input", () => {
    const wide = { ...input, files: [{ name: "data.csv", content: `a,b\n${"x".repeat(200_000)}` }] };
    expect(reviewInput(wide, runChecks(wide)).length).toBeLessThan(LIMIT);
  });

  it("stays bounded with many files, and names the ones it does not show", () => {
    const content = Array.from({ length: 60 }, () => "y".repeat(400)).join("\n");
    const many = { ...input, files: Array.from({ length: 40 }, (_, i) => ({ name: `part-${i}.md`, content })) };
    const text = reviewInput(many, runChecks(many));
    expect(text.length).toBeLessThan(LIMIT);
    expect(text).toContain("part-39.md");
  });

  it("keeps the start and the end of a very long report", () => {
    const long = { ...input, report: `START ${"r".repeat(200_000)} END` };
    const text = reviewInput(long, runChecks(long));
    expect(text.length).toBeLessThan(LIMIT);
    expect(text).toContain("START");
    expect(text).toContain(" END");
  });
});

describe("reviewInput", () => {
  it("shows the reviewer a spreadsheet as what it is and its size, never its base64", () => {
    const text = reviewInput(input, runChecks(input));
    expect(text).toContain("FILE data.xlsx");
    expect(text).toContain("(a spreadsheet file, 29 bytes)");
    expect(text).not.toContain(input.files[0].content);
  });

  // qa-ai F1: the reviewer read a spreadsheet as its size, and a chart as the first 500 characters of one SVG line.
  it("shows the reviewer a spreadsheet's sheets and rows, and a chart's values", () => {
    const spreadsheets = [{ file: "data.xlsx", sheets: [{ name: "Prices", columns: ["app", "eur"], rows: [["Teams", 5.6]] }] }];
    const chart = `<svg xmlns="http://www.w3.org/2000/svg">${"<g>".repeat(50)}<path aria-label="quarter: Q2; Sales: 9550" role="graphics-symbol" aria-roledescription="bar" d="M0Z"/>${"</g>".repeat(50)}</svg>`;
    const withBoth = { ...input, files: [...input.files, { name: "sales.svg", content: chart }], spreadsheets };
    const text = reviewInput(withBoth, runChecks(withBoth));
    expect(text).toContain('Sheet "Prices"');
    expect(text).toContain("Teams,5.6");
    expect(text).toContain("quarter: Q2; Sales: 9550");
  });

  it("shows a text file's own lines", () => {
    expect(reviewInput(input, runChecks(input))).toContain("Prices are list prices.");
  });

  // Q148: the reviewer failed a file for quoting a value the CSV check required quoted. Shown the checks, it can
  // see which rules are fixed.
  it("shows the reviewer the code checks the run passed, as fixed rules", () => {
    const csv: EvaluateInput = { ...input, files: [{ name: "labs.csv", content: 'name,hq\nDeepMind,"London, UK"\n' }] };
    const text = reviewInput(csv, runChecks(csv));
    expect(text).toMatch(/CHECKS/);
    expect(text).toContain("The CSV parses: labs.csv: 2 columns");
  });
});

// qa-ai F11 and F2: the reviewer leaned to "suitable" and was never asked to check numbers; it caught made-up links
// and an obeyed injection on its own, by 0.01 and 0.02.
describe("REVIEW_INSTRUCTIONS: numbers, facts and sources", () => {
  it("tells it to recompute totals from data the instructions give, and check each given number appears unchanged", () => {
    expect(REVIEW_INSTRUCTIONS).toMatch(/recompute[^.]*totals[^.]*from data the instructions give/i);
    expect(REVIEW_INSTRUCTIONS).toMatch(/each number the instructions give appears unchanged/i);
  });

  it("tells it a wrong number or fact, or a source that looks made up, is not suitable", () => {
    expect(REVIEW_INSTRUCTIONS).toMatch(/made[- ]up/i);
    expect(REVIEW_INSTRUCTIONS).toMatch(/is NOT suitable/);
    expect(REVIEW_INSTRUCTIONS).toMatch(/what the run read/i);
  });

  it("no longer calls a thin summary suitable by rule", () => {
    expect(REVIEW_INSTRUCTIONS).not.toMatch(/a summary that is thin/);
  });

  // The suite's mixed-topic case: one stray row in nine is a note, not a fail; the stricter prompt failed it.
  it("still lets one borderline or off-topic row in a list pass, and says a wrong number or fact never does", () => {
    expect(REVIEW_INSTRUCTIONS).toMatch(/one borderline or off-topic row in a list/i);
    expect(REVIEW_INSTRUCTIONS).toMatch(/never a small blemish/i);
  });

  it("says a truthful 'cannot be done here' or one question only the person can answer is finished and suitable", () => {
    expect(REVIEW_INSTRUCTIONS).toMatch(/truthfully[^.]*cannot be done/i);
  });
});

// qa-ai F8: a step the agent did not tick is not work left undone by itself
describe("reviewInput: steps not marked", () => {
  it("shows a step the agent did not tick as not marked, and the instructions say to judge it by the report", () => {
    const plan = { intent: "x", expectedOutputs: [], sources: [], steps: [{ index: 0, title: "Answer", status: "unmarked" as const }] };
    expect(reviewInput({ ...input, plan }, [])).toContain("1. [not marked] Answer");
    expect(REVIEW_INSTRUCTIONS).toMatch(/not marked[^.]*report/i);
  });
});

// qa-ai F14: a fix attempt is a step of its own, after the plan's steps
describe("reviewInput: fix attempts", () => {
  it("lists each fix attempt after the steps, by what it changed", () => {
    const plan = {
      intent: "x",
      expectedOutputs: [],
      sources: [],
      steps: [{ index: 0, title: "Draw the chart", status: "done" as const }],
      fixes: [{ attempt: 1, title: "Put the unit in the axis title", note: "Sales (euros)" }],
    };
    expect(reviewInput({ ...input, plan }, [])).toContain("fix 1: Put the unit in the axis title - Sales (euros)");
  });
});

describe("reviewInput: what the run read", () => {
  it("shows the start of each outside result the run read", () => {
    const text = reviewInput({ ...input, read: [{ tool: "WebSearch", text: "Norway: no public holidays in October." }] }, []);
    expect(text).toMatch(/WHAT THE RUN READ/);
    expect(text).toContain("Norway: no public holidays in October.");
  });
});

describe("REVIEW_INSTRUCTIONS", () => {
  it("says the checks' rules are fixed, and never to ask for a change that would fail one", () => {
    expect(REVIEW_INSTRUCTIONS).toMatch(/never ask for a change that would (break|fail)/i);
  });

  it("says a valid file whose report explains an instruction it could not meet is finished and suitable", () => {
    expect(REVIEW_INSTRUCTIONS).toMatch(/valid file whose report says what was done instead and why/);
    expect(REVIEW_INSTRUCTIONS).toMatch(/finished and suitable/);
  });

  // Local run 6455137d: the reviewer's reasons, quoted in Why?, named the agent's tools. An office worker reads them.
  it("asks for changeNeeded and reasoning in plain words for an office worker: no tool names, no shell or curl, no paths", () => {
    expect(REVIEW_INSTRUCTIONS).toMatch(/changeNeeded and reasoning are read by an office worker/i);
    expect(REVIEW_INSTRUCTIONS).toMatch(/no tool names/i);
    expect(REVIEW_INSTRUCTIONS).toMatch(/no shell or curl/i);
    expect(REVIEW_INSTRUCTIONS).toMatch(/no file paths beyond a file's own name/i);
  });

  // qa-ux U31: the reviewer's reasoning is quoted in Why?, where "data-exfiltration pattern" means nothing to the reader
  it("keeps security jargon out of changeNeeded and reasoning, and says what it means instead", () => {
    expect(REVIEW_INSTRUCTIONS).toMatch(/no security jargon/i);
    for (const jargon of ["data-exfiltration", "endpoint", "query parameter", "proxies"]) expect(REVIEW_INSTRUCTIONS).toContain(`"${jargon}`);
    expect(REVIEW_INSTRUCTIONS).toMatch(/sending your data to another website/i);
  });
});

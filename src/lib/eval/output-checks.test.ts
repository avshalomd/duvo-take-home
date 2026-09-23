import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { EvaluateInput } from "@/contracts/eval";
import { runChecks } from "./checks";

// Q124: a chart (.svg) and a spreadsheet (.xlsx) from the output tools get a check of their own, like a CSV does,
// and each check names the file it looked at. The chart is the real one the chart tool drew in a recorded run.
const realChart: string = JSON.parse(readFileSync("fixtures/runs/chart-and-spreadsheet.json", "utf8")).files.find((f: { name: string }) => f.name === "fruit.svg").content;

function input(files: EvaluateInput["files"]): EvaluateInput {
  return { prompt: "Make a bar chart of the prices and a spreadsheet of them.", runStatus: "succeeded", report: "Done.", plan: null, files, today: "2026-09-23" };
}
const check = (files: EvaluateInput["files"], id: string) => runChecks(input(files)).find((c) => c.id === id);
const zip = (bytes: string) => Buffer.from(bytes, "binary").toString("base64"); // how collectFiles stores an .xlsx

describe("the chart check", () => {
  it("passes the chart the chart tool drew: well-formed, with marks and a title, and says so with the file's name", () => {
    const got = check([{ name: "fruit.svg", content: realChart }], "chart");
    expect(got?.ok, got?.detail).toBe(true);
    expect(got?.label).toMatch(/fruit\.svg/);
    expect(got?.detail).toMatch(/^fruit\.svg: /);
    expect(got?.detail).toMatch(/Fruit Counts/);
    expect(got?.detail).toMatch(/3 marks/);
  });

  it("fails a chart cut off part-way and names the element left open", () => {
    const got = check([{ name: "fruit.svg", content: realChart.slice(0, 4000) }], "chart");
    expect(got?.ok).toBe(false);
    expect(got?.detail).toMatch(/^fruit\.svg: /);
    expect(got?.detail).toMatch(/never closed|closes/);
  });

  it("fails a file that is not an SVG at all", () => {
    const got = check([{ name: "chart.svg", content: "Here is your chart: bars for apples, pears, plums." }], "chart");
    expect(got?.ok).toBe(false);
    expect(got?.detail).toMatch(/<svg>/);
  });

  it("fails a chart with no title", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><g><path role="graphics-symbol" aria-roledescription="bar" d="M0,0h1v1z"/></g></svg>`;
    const got = check([{ name: "prices.svg", content: svg }], "chart");
    expect(got?.ok).toBe(false);
    expect(got?.detail).toMatch(/no title/);
  });

  it("fails a chart with a title and nothing drawn", () => {
    const got = check([{ name: "prices.svg", content: `<svg xmlns="http://www.w3.org/2000/svg"><title>Prices</title><rect width="10" height="10"/></svg>` }], "chart");
    expect(got?.ok).toBe(false);
    expect(got?.detail).toMatch(/nothing drawn/);
  });

  it("accepts a standard <title> and plain text labels as a chart's title and content", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><title>Prices</title><text x="1" y="1">apples 3</text></svg>`;
    expect(check([{ name: "prices.svg", content: svg }], "chart")?.ok).toBe(true);
  });
});

describe("the spreadsheet check", () => {
  it("passes a workbook whose bytes start as a zip archive, as every .xlsx does, and gives its size", () => {
    const got = check([{ name: "fruit.xlsx", content: zip("PK\x03\x04 the rest of the workbook") }], "spreadsheet");
    expect(got?.ok).toBe(true);
    expect(got?.label).toMatch(/fruit\.xlsx/);
    expect(got?.detail).toMatch(/^fruit\.xlsx: /);
    expect(got?.detail).toMatch(/29 bytes/);
  });

  it("fails a file named .xlsx that is not a zip archive", () => {
    const got = check([{ name: "fruit.xlsx", content: zip("fruit,count\napples,3\n") }], "spreadsheet");
    expect(got?.ok).toBe(false);
    expect(got?.detail).toMatch(/not a workbook/);
  });

  it("fails an empty spreadsheet", () => {
    const got = check([{ name: "fruit.xlsx", content: "" }], "spreadsheet");
    expect(got?.ok).toBe(false);
    expect(got?.detail).toMatch(/empty/);
  });

  it("reads the size when only '(mime, n bytes)' reached the evaluator, and says the signature was not seen", () => {
    const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const got = check([{ name: "fruit.xlsx", content: `(${mime}, 6612 bytes)` }], "spreadsheet");
    expect(got?.ok).toBe(true);
    expect(got?.detail).toMatch(/6612 bytes/);
    expect(got?.detail).toMatch(/only its size/);
    expect(check([{ name: "fruit.xlsx", content: `(${mime}, 0 bytes)` }], "spreadsheet")?.ok).toBe(false);
  });
});

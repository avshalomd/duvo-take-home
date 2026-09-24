import { describe, expect, it } from "vitest";
import { forModel } from "./file-view";

// qa-ai F1: the chart tool writes its SVG as one 11 KB line, and the judge read only the first 300 characters of it: a
// chart with a wrong value passed on the report's word. A spreadsheet reached both models as its size alone.

// The shape vega draws: marks labelled with their data, axes and a title labelled with what they are.
const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" data-rows="4" width="724" height="463"><g class="mark-group role-frame root" role="graphics-object" aria-roledescription="group mark container">',
  `<g role="graphics-symbol" aria-roledescription="axis" aria-label="X-axis titled 'quarter' for a discrete scale with 4 values: Q1, Q2, Q3, Q4"></g>`,
  `<g role="graphics-symbol" aria-roledescription="axis" aria-label="Y-axis titled 'Sales' for a linear scale with values from 0 to 140,000"></g>`,
  '<g role="graphics-object" aria-roledescription="rect mark container">',
  '<path aria-label="quarter: Q1; Sales: 120000" role="graphics-symbol" aria-roledescription="bar" d="M0,0h1v1Z"/>',
  '<path aria-label="quarter: Q2; Sales: 9550" role="graphics-symbol" aria-roledescription="bar" d="M0,0h1v1Z"/>',
  '<path aria-label="quarter: Q3; Sales: 101000" role="graphics-symbol" aria-roledescription="bar" d="M0,0h1v1Z"/>',
  '<path aria-label="quarter: Q4; Sales: 130500" role="graphics-symbol" aria-roledescription="bar" d="M0,0h1v1Z"/>',
  "</g>",
  `<g role="graphics-symbol" aria-roledescription="title" aria-label="Title text 'Sales 2025 by quarter'"><text>Sales 2025 by quarter</text></g>`,
  "</g></svg>",
].join("");

describe("what a model reads of a chart", () => {
  it("reads its title and every value it draws, one per line, not its markup", () => {
    const text = forModel({ name: "sales.svg", content: svg });
    expect(text).toContain("Sales 2025 by quarter");
    expect(text.split("\n")).toContain("quarter: Q2; Sales: 9550");
    expect(text.split("\n")).toContain("quarter: Q4; Sales: 130500");
    expect(text).toMatch(/4 values/);
    expect(text).not.toContain("<path");
  });

  it("reads its axes, where the unit is", () => {
    expect(forModel({ name: "sales.svg", content: svg })).toContain("Y-axis titled 'Sales'");
  });

  it("says so when a chart carries no labels to read", () => {
    expect(forModel({ name: "empty.svg", content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' })).toMatch(/no labels/);
  });
});

describe("what a model reads of a spreadsheet", () => {
  const workbook = Buffer.from("PK\x03\x04 the rest of the workbook", "binary").toString("base64");
  const sheets = [
    {
      file: "compare.xlsx",
      sheets: [
        { name: "Apps", columns: ["app", "price_per_user_eur", "users"], rows: [["Teams", 5.6, 50], ["Slack", 7.25, 50]] },
        { name: "Notes", columns: ["note"], rows: [["billed yearly"]] },
      ],
    },
  ];

  it("reads each sheet's name, header and rows from what the spreadsheet tool was given", () => {
    const text = forModel({ name: "compare.xlsx", content: workbook }, sheets);
    expect(text).toContain('Sheet "Apps" (2 rows)');
    expect(text.split("\n")).toContain("app,price_per_user_eur,users");
    expect(text.split("\n")).toContain("Slack,7.25,50");
    expect(text).toContain('Sheet "Notes" (1 row)');
    expect(text).not.toContain(workbook);
  });

  it("falls back to what it is and its size when the tool's input is not known", () => {
    expect(forModel({ name: "data.xlsx", content: workbook })).toBe("(a spreadsheet file, 29 bytes)");
    expect(forModel({ name: "data.xlsx", content: workbook }, sheets)).toBe("(a spreadsheet file, 29 bytes)");
  });

  it("quotes a cell holding a comma, so a row reads as its own values", () => {
    const withComma = [{ file: "a.xlsx", sheets: [{ name: "S", columns: ["city"], rows: [["London, UK"]] }] }];
    expect(forModel({ name: "a.xlsx", content: workbook }, withComma).split("\n")).toContain('"London, UK"');
  });
});

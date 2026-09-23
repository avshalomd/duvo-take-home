import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { workbookBuffer, type SheetArgs } from "./spreadsheet";

/** Writes the workbook and reads it back the way Excel would see it. */
async function roundTrip(sheets: SheetArgs) {
  const wb = new ExcelJS.Workbook();
  // exceljs types its input as an ArrayBuffer, and reads a Node Buffer just the same at runtime
  await wb.xlsx.load((await workbookBuffer(sheets)) as unknown as ArrayBuffer);
  return wb;
}

const population: SheetArgs = [
  {
    name: "Population",
    columns: ["Country", "Population", "EU member"],
    rows: [
      ["Germany", 83400000, true],
      ["France", 68400000, true],
    ],
  },
];

describe("workbookBuffer", () => {
  it("writes one worksheet per sheet, in the order given", async () => {
    const wb = await roundTrip([...population, { name: "Notes", columns: ["Note"], rows: [["from Eurostat"]] }]);
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(["Population", "Notes"]);
  });

  it("puts the columns in a bold header row that stays in view when scrolling", async () => {
    const ws = (await roundTrip(population)).getWorksheet("Population")!;
    expect(ws.getRow(1).values).toEqual([undefined, "Country", "Population", "EU member"]); // exceljs rows are 1-based
    expect(ws.getCell("A1").font?.bold).toBe(true);
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
  });

  it("stores numbers as numbers and booleans as booleans, so Excel can sum and filter them", async () => {
    const ws = (await roundTrip(population)).getWorksheet("Population")!;
    expect(ws.getCell("B2").value).toBe(83400000);
    expect(ws.getCell("C2").value).toBe(true);
  });

  it("turns a number the agent sent as text into a number, but keeps leading zeros as text", async () => {
    const ws = (await roundTrip([{ name: "S", columns: ["Amount", "Postcode"], rows: [["1250.5", "01067"]] }])).getWorksheet("S")!;
    expect(ws.getCell("A2").value).toBe(1250.5);
    expect(ws.getCell("B2").value).toBe("01067"); // a postcode or an id is not a quantity
  });

  it("leaves an empty cell for a null", async () => {
    const ws = (await roundTrip([{ name: "S", columns: ["A", "B"], rows: [[null, 1]] }])).getWorksheet("S")!;
    expect(ws.getCell("A2").value).toBeNull();
    expect(ws.getCell("B2").value).toBe(1);
  });

  it("makes each column wide enough for its header and its longest value, within a readable limit", async () => {
    const long = "x".repeat(200);
    const ws = (await roundTrip([{ name: "S", columns: ["Country", "Description"], rows: [["Netherlands", long]] }])).getWorksheet("S")!;
    expect(ws.getColumn(1).width).toBeGreaterThanOrEqual("Netherlands".length);
    expect(ws.getColumn(2).width).toBeLessThanOrEqual(60); // a paragraph does not make a column a screen wide
  });

  it("repairs sheet names Excel would reject: forbidden characters and duplicates", async () => {
    const wb = await roundTrip([
      { name: "Q1/Q2", columns: ["A"], rows: [] },
      { name: "Data", columns: ["A"], rows: [] },
      { name: "data", columns: ["A"], rows: [] }, // Excel compares sheet names without case
    ]);
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(["Q1-Q2", "Data", "data (2)"]);
  });
});

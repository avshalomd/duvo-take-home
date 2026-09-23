import ExcelJS from "exceljs";
import type { z } from "zod";
import type { SpreadsheetInput } from "@/contracts/outputs";
import { asNumber } from "./numbers";

/** make_spreadsheet's sheets: one worksheet each, a header row of columns and the rows under it. */
export type SheetArgs = z.infer<typeof SpreadsheetInput.sheets>;
type Cell = SheetArgs[number]["rows"][number][number];

const MIN_WIDTH = 8;
const MAX_WIDTH = 60; // a paragraph in one cell must not make its column a screen wide
const WIDTH_SAMPLE = 500; // the first rows are enough to judge a column's width

/**
 * Sheet names Excel accepts: none of \ / ? * [ ] :, at most 31 characters, and unique regardless of case.
 * A forbidden character becomes "-" and a repeated name gets " (2)", so the agent's names survive as nearly as possible.
 */
function sheetNames(names: string[]): string[] {
  const taken = new Set<string>();
  return names.map((raw) => {
    const clean = raw.replace(/[\\/?*[\]:]/g, "-").replace(/^'+|'+$/g, "").trim().slice(0, 31) || "Sheet";
    let name = clean;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${clean.slice(0, 31 - ` (${n})`.length)} (${n})`;
    taken.add(name.toLowerCase());
    return name;
  });
}

/** Wide enough for the header and the longest value in the first rows, within MIN_WIDTH and MAX_WIDTH. */
function columnWidth(header: string, rows: Cell[][], index: number): number {
  const longest = Math.max(header.length, ...rows.slice(0, WIDTH_SAMPLE).map((r) => String(r[index] ?? "").length));
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, longest + 2)); // +2: a little air on each side
}

/** An .xlsx as bytes: one worksheet per sheet, a bold header row frozen at the top, numbers stored as numbers. */
export async function workbookBuffer(sheets: SheetArgs): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const names = sheetNames(sheets.map((s) => s.name));
  sheets.forEach((sheet, i) => {
    const ws = wb.addWorksheet(names[i], { views: [{ state: "frozen", ySplit: 1 }] }); // the header stays in view
    ws.columns = sheet.columns.map((header, c) => ({ header, width: columnWidth(header, sheet.rows, c) }));
    ws.getRow(1).font = { bold: true };
    // A null is an empty cell; a number sent as text is stored as a number, so Excel can sum and sort it.
    for (const row of sheet.rows) ws.addRow(row.map((cell) => asNumber(cell)));
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

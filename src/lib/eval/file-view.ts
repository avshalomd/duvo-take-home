import type { SheetFile } from "@/contracts/eval";

// What the judge and the reviewer read of a file. A text file is its text. The two files our tools render are read
// for what they hold (qa-ai F1): a chart by the labels vega writes on every mark ("quarter: Q2; Sales: 95500"), since
// its SVG is one 11 KB line of drawing a model cannot read; a spreadsheet by the sheets the spreadsheet tool was
// given, since its bytes are a zip archive. A spreadsheet reaches the evaluator as base64, the way collectFiles stores
// it, or, from a caller that has not passed its content through, as "(mime, n bytes)": the checks read what they can
// from either, and a model is never shown the base64.

const SIZE_ONLY = /^\((.+), (\d+) bytes\)$/; // "(application/vnd...sheet, 6612 bytes)"
const ROWS_PER_SHEET = 20; // a sheet's first rows show its shape; the judge reads 40 lines of a file, the reviewer 60

export const isSpreadsheet = (name: string) => name.toLowerCase().endsWith(".xlsx");
const isChart = (name: string) => name.toLowerCase().endsWith(".svg");

/** The spreadsheet's bytes when they reached the evaluator, or only its size when they did not. */
export function spreadsheetBytes(content: string): { bytes: Buffer; size: number } | { bytes: null; size: number } {
  const sizeOnly = content.match(SIZE_ONLY);
  if (sizeOnly) return { bytes: null, size: Number(sizeOnly[2]) };
  const bytes = Buffer.from(content, "base64");
  return { bytes, size: bytes.byteLength };
}

/** What a model reads for a file: its text; a chart's title, axes and values; a spreadsheet's sheets and rows. */
export function forModel(file: { name: string; content: string }, spreadsheets: SheetFile[] = []): string {
  if (isSpreadsheet(file.name)) {
    const sheets = spreadsheets.find((s) => s.file === file.name);
    return sheets ? spreadsheetText(sheets) : `(a spreadsheet file, ${spreadsheetBytes(file.content).size} bytes)`;
  }
  if (isChart(file.name)) return chartText(file.content);
  return file.content;
}

// ---- the chart ---------------------------------------------------------------------------------------------------

const LABELLED = /<[^>]*\baria-label="([^"]*)"[^>]*>/g;

function chartText(svg: string): string {
  const titles: string[] = [];
  const axes: string[] = [];
  const values: string[] = [];
  for (const m of svg.matchAll(LABELLED)) {
    const label = decode(m[1]).trim();
    const role = m[0].match(/aria-roledescription="([^"]*)"/)?.[1] ?? "";
    if (!label) continue;
    if (role === "title" || /^Title text /.test(label)) titles.push(label.replace(/^Title text '(.*)'$/, "$1"));
    else if (role === "axis" || role === "legend") axes.push(label);
    else values.push(label); // a bar, a point, a slice: vega labels each with its data
  }
  const own = svg.match(/<title\b[^>]*>([^<]*)<\/title>/)?.[1]?.trim();
  if (!titles.length && own) titles.push(decode(own));
  if (!titles.length && !axes.length && !values.length) return "(a chart with no labels to read: it may draw nothing)";
  return [
    `(a chart: ${values.length} ${values.length === 1 ? "value" : "values"}, read from its labels)`,
    ...titles.map((t) => `Title: ${t}`),
    ...axes,
    ...values,
  ].join("\n");
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&lt;": "<", "&gt;": ">" };
const decode = (s: string) => s.replace(/&(amp|quot|#39|apos|lt|gt);/g, (e) => ENTITIES[e]);

// ---- the spreadsheet ---------------------------------------------------------------------------------------------

function spreadsheetText(file: SheetFile): string {
  const lines = [`(a spreadsheet with ${file.sheets.length} ${file.sheets.length === 1 ? "sheet" : "sheets"})`];
  for (const sheet of file.sheets) {
    const n = sheet.rows.length;
    lines.push(`Sheet "${sheet.name}" (${n} ${n === 1 ? "row" : "rows"}):`, sheet.columns.map(cell).join(","));
    lines.push(...sheet.rows.slice(0, ROWS_PER_SHEET).map((r) => r.map(cell).join(",")));
    if (n > ROWS_PER_SHEET) lines.push(`(and ${n - ROWS_PER_SHEET} more rows)`);
  }
  return lines.join("\n");
}

// Written as a CSV row would be, so a value holding a comma reads as one value.
function cell(v: string | number | boolean | null): string {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

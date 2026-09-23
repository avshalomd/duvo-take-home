// A spreadsheet (.xlsx) is the one binary output. It reaches the evaluator as base64, the way collectFiles stores
// it, or, from a caller that has not passed its content through, as "(mime, n bytes)". The checks read what they can
// from either; the judge and the reviewer are shown only what it is and its size, because base64 tells a model
// nothing and would fill its context.

const SIZE_ONLY = /^\((.+), (\d+) bytes\)$/; // "(application/vnd...sheet, 6612 bytes)"

export const isSpreadsheet = (name: string) => name.toLowerCase().endsWith(".xlsx");

/** The spreadsheet's bytes when they reached the evaluator, or only its size when they did not. */
export function spreadsheetBytes(content: string): { bytes: Buffer; size: number } | { bytes: null; size: number } {
  const sizeOnly = content.match(SIZE_ONLY);
  if (sizeOnly) return { bytes: null, size: Number(sizeOnly[2]) };
  const bytes = Buffer.from(content, "base64");
  return { bytes, size: bytes.byteLength };
}

/** What a model reads for a file: its text, or for a spreadsheet a line saying what it is and how big. */
export function forModel(file: { name: string; content: string }): string {
  return isSpreadsheet(file.name) ? `(a spreadsheet file, ${spreadsheetBytes(file.content).size} bytes)` : file.content;
}

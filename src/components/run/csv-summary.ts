import { parse } from "csv-parse/sync";

/**
 * How many data rows a CSV has and what its columns are, for the file's tile. Read on the server (the page reads
 * the file once), with the same parser the evaluator uses, so a quoted value with a line break counts as one row.
 */
export function csvSummary(content: string): { rows: number; columns: string[] } | null {
  if (!content.trim()) return null;
  try {
    // relax_column_count: a ragged row is the evaluator's business, not a reason for the tile to say nothing
    const records: string[][] = parse(content, { skip_empty_lines: true, relax_column_count: true });
    if (records.length === 0) return null;
    return { rows: records.length - 1, columns: records[0].map((c) => c.trim()) };
  } catch {
    return null; // not parseable as CSV: the tile shows the size only
  }
}

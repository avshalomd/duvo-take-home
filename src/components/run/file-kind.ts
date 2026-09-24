import type { FileFlag } from "@/contracts/run";

// How a produced file is shown, and the words on its tile. Pure, so every sentence is tested without a DOM.

export type FileKind = "chart" | "spreadsheet" | "document";

export function fileKind(name: string): FileKind {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "svg") return "chart"; // only the chart tool makes .svg files (AgentLimits.toolFileExtensions)
  if (ext === "xlsx") return "spreadsheet";
  return "document";
}

/** "Contains 12 email addresses and 1 phone number": the personal data the output scan counted, or null. */
export function flagLine(flags: FileFlag[] | undefined): string | null {
  // a credential quarantines the file, and the quarantine warning says so: it is not repeated here
  const personal = (flags ?? []).filter((f) => f.kind !== "credential").map((f) => f.detail);
  if (personal.length === 0) return null;
  return `Contains ${listOf(personal)}`;
}

/** A size a person reads: bytes under a kilobyte, so a small file never shows as "0.0 KB" (Q99). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A .md or .txt file: its tile shows its first lines and says its size in lines (UX QA U21). */
export function isTextFile(name: string): boolean {
  const ext = name.toLowerCase().split(".").pop();
  return ext === "md" || ext === "txt";
}

/** "3 lines", "1 line" or "Empty": a text file's size as a person reads it, instead of bytes (UX QA U21). */
export function linesLine(lines: number): string {
  if (lines === 0) return "Empty";
  return `${lines} ${lines === 1 ? "line" : "lines"}`;
}

/** What the empty file area says, by the state of the run: files are collected when a run ends (Q100, Q122). */
export function noFilesLine(status: string, hasReport: boolean): string {
  if (status === "queued" || status === "running" || status === "evaluating") return "Files appear here when the run finishes.";
  if (status === "failed") return "The run ended before it saved any files.";
  if (status === "cancelled") return "The run was stopped before it saved any files.";
  return hasReport ? "No files: the answer is in the report below." : "This run made no files.";
}

const SHOWN_COLUMNS = 3;

/** "12 rows with title, source, url and 2 more columns": a CSV tile's facts. */
export function csvLine({ rows, columns }: { rows: number; columns: string[] }): string {
  if (rows === 0) return `No rows, only the ${listOf(columns)} ${columns.length === 1 ? "column" : "columns"}`;
  const count = `${rows} ${rows === 1 ? "row" : "rows"}`;
  if (columns.length <= SHOWN_COLUMNS) return `${count} with ${listOf(columns)}`;
  const more = columns.length - SHOWN_COLUMNS;
  return `${count} with ${columns.slice(0, SHOWN_COLUMNS).join(", ")} and ${more} more ${more === 1 ? "column" : "columns"}`;
}

export type Sheet = { name: string; rows: number };

type EventLike = { kind: string; payload: unknown };

/**
 * A spreadsheet's sheets, read from the spreadsheet tool's call that made the file (the latest one, if the agent
 * made it twice). The call carries the sheets as data, so the tile needs no workbook parser.
 */
export function sheetsOf(events: EventLike[], file: string): Sheet[] {
  let sheets: Sheet[] = [];
  for (const e of events) {
    if (e.kind !== "tool_call") continue;
    const p = e.payload as { name?: string; input?: { file?: unknown; sheets?: unknown } };
    if (!p.name?.endsWith("__make_spreadsheet") || p.input?.file !== file || !Array.isArray(p.input.sheets)) continue;
    sheets = p.input.sheets.map((s: { name?: unknown; rows?: unknown }) => ({ name: String(s.name ?? ""), rows: Array.isArray(s.rows) ? s.rows.length : 0 }));
  }
  return sheets;
}

/**
 * The sheets of each spreadsheet among a run's files, read from the events of the runs it follows up (oldest first).
 * Q205: a follow-up gets its parent's files back and keeps them without making them again, so its own events have
 * no call for them; the run that made the file still has it.
 */
export function carriedSheets(files: string[], earlier: EventLike[]): Record<string, Sheet[]> {
  const found: Record<string, Sheet[]> = {};
  for (const file of files) {
    if (fileKind(file) !== "spreadsheet") continue;
    const sheets = sheetsOf(earlier, file);
    if (sheets.length) found[file] = sheets;
  }
  return found;
}

/** A spreadsheet tile's sheets: from the run's own call when it made the file, else what was carried over. */
export function tileSheets(file: string, events: EventLike[], carried: Sheet[] = []): Sheet[] {
  const own = sheetsOf(events, file);
  return own.length ? own : carried;
}

/** "Sheets Summary (2 rows) and Data (1 row)", or "One sheet, Sheet1, with 40 rows". */
export function sheetsLine(sheets: Sheet[]): string | null {
  if (sheets.length === 0) return null;
  const rows = (n: number) => `${n} ${n === 1 ? "row" : "rows"}`;
  if (sheets.length === 1) return `One sheet, ${sheets[0].name}, with ${rows(sheets[0].rows)}`;
  return `Sheets ${listOf(sheets.map((s) => `${s.name} (${rows(s.rows)})`))}`;
}

/** "a", "a and b", "a, b and c". */
function listOf(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

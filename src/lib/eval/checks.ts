import { parse } from "csv-parse/sync";
import type { Check, EvaluateInput } from "@/contracts/eval";

// The half of the evaluator that costs nothing and cannot be talked round: everything that can be decided by
// reading the instructions and the files. Any failure here ends the evaluation before a model is paid to look at
// an empty file. Each check carries the detail a user needs to fix the run, not just a red tick.

const ALLOWED_EXTENSIONS = [".txt", ".md", ".csv"]; // the agent is only allowed to write these (DESIGN, Model design)
const DEFAULT_FRESH_DAYS = 30; // "latest" with no window named: a month is the widest reading of "latest news"

export function runChecks(input: EvaluateInput): Check[] {
  const checks: Check[] = [];
  const ok = (id: string, label: string, okay: boolean, detail: string) => checks.push({ id, label, ok: okay, detail });

  ok(
    "completed",
    "The run finished",
    input.runStatus === "succeeded",
    input.runStatus === "succeeded" ? "succeeded" : `run status ${input.runStatus} - ${oneLine(input.report ?? "no report")}`,
  );

  connectionCheck(input, ok);

  if (asksForFile(input.prompt)) {
    ok("file_expected", "A file was written", input.files.length > 0, input.files.length ? names(input.files) : "no file was written");
  }
  if (input.files.length === 0) return checks;

  const wrongType = input.files.filter((f) => !ALLOWED_EXTENSIONS.some((e) => f.name.toLowerCase().endsWith(e)));
  ok(
    "extension",
    "Only .txt, .md and .csv were written",
    wrongType.length === 0,
    wrongType.length ? `not allowed: ${names(wrongType)}` : names(input.files),
  );

  for (const file of input.files) {
    if (file.name.toLowerCase().endsWith(".csv")) csvChecks(file, input, ok);
    else if (/\.(md|txt)$/i.test(file.name)) {
      ok("content", "The file has content", file.content.trim().length > 0, file.content.trim() ? `${file.content.trim().length} characters` : `${file.name} is empty`);
    }
  }
  return checks;
}

type Push = (id: string, label: string, ok: boolean, detail: string) => void;

function csvChecks(file: { name: string; content: string }, input: EvaluateInput, ok: Push) {
  let rows: string[][];
  try {
    // relax_column_count: a ragged row is a content problem for the row checks to describe, not a parse failure.
    rows = parse(file.content, { relax_column_count: true, skip_empty_lines: true, trim: true }) as string[][];
  } catch (e) {
    // The parser's own words ("Quote Not Closed...") say more than "invalid CSV", and they point at the line.
    ok("parses", "The CSV parses", false, `${file.name}: ${oneLine(e instanceof Error ? e.message : String(e))}`);
    return;
  }
  const [header = [], ...data] = rows;
  ok("parses", "The CSV parses", true, `${file.name}: ${header.length} columns`);

  const floor = rowFloor(input.prompt);
  ok(
    "rows",
    "The CSV has rows",
    data.length >= floor,
    data.length === 0 ? `${file.name} has a header and no rows` : `${data.length} rows${data.length < floor ? `, at least ${floor} asked for` : ""}`,
  );
  if (data.length === 0) return;

  const wanted = columnsAskedFor(input.prompt);
  if (wanted.length >= 2) {
    const have = header.map((h) => h.toLowerCase().trim());
    const missing = wanted.filter((w) => !have.includes(w));
    ok("columns", "The columns the instructions named are there", missing.length === 0, missing.length ? `missing columns: ${missing.join(", ")}` : have.join(", "));
  }

  duplicateCheck(header, data, ok);
  freshnessCheck(header, data, input, ok);
}

// Padding is the failure this catches: the same story under three titles, or the same row twice. Identity is the
// URL when there is one - titles and summaries are exactly what a model varies while repeating itself.
function duplicateCheck(header: string[], data: string[][], ok: Push) {
  const urlAt = header.findIndex((h) => /^(url|link|href|source_url)$/i.test(h.trim()));
  const keys = data.map((row) => (urlAt >= 0 ? (row[urlAt] ?? "").trim().toLowerCase() : row.join("").toLowerCase()));
  const distinct = new Set(keys.filter(Boolean)).size;
  const what = urlAt >= 0 ? "distinct urls" : "distinct rows";
  ok("duplicates", "No row is a duplicate of another", distinct === keys.length, `${data.length} rows, ${distinct} ${what}`);
}

// A model that cannot search answers from memory, and the giveaway is the dates. Only run when the instructions
// ask for something recent, and only when the file has a date column to read.
function freshnessCheck(header: string[], data: string[][], input: EvaluateInput, ok: Push) {
  const days = freshnessWindow(input.prompt);
  if (days === null) return;
  const dateAt = header.findIndex((h) => /(date|published|updated|_at)$/i.test(h.trim()));
  if (dateAt < 0) return;
  const today = Date.parse(input.today);
  if (Number.isNaN(today)) return;
  const dated = data.map((row) => Date.parse((row[dateAt] ?? "").trim())).filter((t) => !Number.isNaN(t));
  if (dated.length === 0) return;
  const cutoff = today - days * 86_400_000;
  const stale = dated.filter((t) => t < cutoff);
  const oldest = new Date(Math.min(...dated)).toISOString().slice(0, 10);
  // More than half stale, not one: a single old backgrounder in a list of fresh news is not a failed run.
  ok(
    "freshness",
    `The rows are from the last ${days} days`,
    stale.length * 2 <= dated.length,
    stale.length ? `${stale.length} of ${dated.length} rows are older than ${days} days (oldest ${oldest})` : `${dated.length} rows, oldest ${oldest}`,
  );
}

// "Use the connected X server" is a promise about HOW the work is done, and the tool names are the evidence: a
// connection's tools are all called mcp__<slug>__*. Checked in code because the model's word is exactly what is
// in doubt - a plausible file written from memory looks the same as one read through the connection.
function connectionCheck(input: EvaluateInput, ok: Push) {
  const named = connectionNamed(input.prompt);
  const tools = input.toolsUsed ?? [];
  if (!named || tools.length === 0) return; // no claim, or no tool names recorded: no evidence either way
  const prefix = `mcp__${named.toLowerCase()}`;
  const used = tools.filter((t) => t.toLowerCase().startsWith(prefix));
  ok(
    "connection_used",
    `The ${named} connection was used`,
    used.length > 0,
    used.length ? used.join(", ") : `no ${prefix}__ tool call; tools used: ${tools.join(", ")}`,
  );
}

/** The connection the instructions say to use, as its slug: "the connected DeepWiki server" -> "deepwiki". */
export function connectionNamed(prompt: string): string | null {
  const m =
    prompt.match(/\bconnected\s+([A-Za-z][A-Za-z0-9_-]*)\s+(?:server|connection|mcp)/i) ??
    prompt.match(/\b(?:via|through|using)\s+the\s+([A-Za-z][A-Za-z0-9_-]*)\s+(?:server|connection|mcp)/i);
  return m ? m[1] : null;
}

/** A file is expected when the instructions ask for one in so many words; a question-only run owes no file. */
export function asksForFile(prompt: string): boolean {
  return /\b(csv|file|save|saved|write|written|export|spreadsheet)\b|\.(md|txt|csv)\b/i.test(prompt);
}

/** "At least 8 rows" is a promise the file either keeps or does not; with no floor named, one row is the floor. */
export function rowFloor(prompt: string): number {
  const m = prompt.match(/at least (\d+)\s*(?:rows|entries|items|lines)/i) ?? prompt.match(/(\d+)\+?\s*(?:rows|entries|items)/i);
  return m ? Number(m[1]) : 1;
}

/** The column list in "a CSV with title, source, url, published_at, summary": two or more names in a row. */
export function columnsAskedFor(prompt: string): string[] {
  const m = prompt.match(/\bwith\s+([a-z][a-z0-9_]*(?:\s*,\s*[a-z][a-z0-9_]*)+)/i);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

/** How many days back the instructions want, or null when they ask for nothing recent. */
export function freshnessWindow(prompt: string): number | null {
  const named = prompt.match(/(?:last|past)\s+(\d+)\s*days/i);
  if (named) return Number(named[1]);
  if (/\b(last|past)\s+week\b/i.test(prompt)) return 7;
  return /\b(latest|recent|newest|today|this week)\b/i.test(prompt) ? DEFAULT_FRESH_DAYS : null;
}

const names = (files: { name: string }[]) => files.map((f) => f.name).join(", ");
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 220);

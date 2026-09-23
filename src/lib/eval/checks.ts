import { parse } from "csv-parse/sync";
import { AgentLimits } from "@/contracts/agent";
import type { Check, EvaluateInput } from "@/contracts/eval";
import { chartCheck, spreadsheetCheck } from "./output-checks";
import { templateChecks } from "./template-checks";

// The half of the evaluator that costs nothing and cannot be talked round: everything that can be decided by
// reading the instructions and the files. Any failure here ends the evaluation before a model is paid to look at
// an empty file. Each check carries the detail a user needs to fix the run, not just a red tick.

// What the Write tool may produce (.txt, .md, .csv) and what v2's output tools render (.svg, .xlsx): the same two
// lists the run loop collects files by, so the evaluator can never reject a file the app itself made.
const ALLOWED_EXTENSIONS: readonly string[] = [...AgentLimits.fileExtensions, ...AgentLimits.toolFileExtensions];
const DEFAULT_FRESH_DAYS = 30; // "latest" with no window named: a month is the widest reading of "latest news"

export function runChecks(input: EvaluateInput): Check[] {
  return [...runChecksOnFiles(input), ...templateChecks(input)]; // a run of a saved automation is also held to its template
}

function runChecksOnFiles(input: EvaluateInput): Check[] {
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
    "Only text, table, chart and spreadsheet files were written",
    wrongType.length === 0,
    wrongType.length ? `not allowed: ${names(wrongType)}` : names(input.files),
  );

  // One check per output kind, and each names the file it read (Q124): with two files, "29 characters" says nothing.
  for (const file of input.files) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv")) csvChecks(file, input, ok);
    else if (name.endsWith(".svg")) checks.push(chartCheck(file));
    else if (name.endsWith(".xlsx")) checks.push(spreadsheetCheck(file));
    else if (/\.(md|txt)$/.test(name)) {
      const size = file.content.trim().length;
      ok("content", `${file.name} has content`, size > 0, size ? `${file.name}: ${size} characters` : `${file.name} is empty`);
    }
  }
  return checks;
}

type Push = (id: string, label: string, ok: boolean, detail: string) => void;

// `info: true` makes csv-parse return each record with the physical line it ended on, which is the row number a
// user sees when they open the file; its types only describe the plain string[][] shape, hence the cast.
type CsvRecord = { record: string[]; info: { lines: number } };

function csvChecks(file: { name: string; content: string }, input: EvaluateInput, push: Push) {
  // Every detail below starts with the file's name (Q124), added here once rather than in each check.
  const ok: Push = (id, label, okay, detail) => push(id, label, okay, detail.startsWith(file.name) ? detail : `${file.name}: ${detail}`);
  let records: CsvRecord[];
  try {
    // relax_column_count so a ragged row is still read: `parses` names it below with the row number and both
    // field counts, which is more use than the parser's "Invalid Record Length".
    records = parse(file.content, { relax_column_count: true, skip_empty_lines: true, trim: true, info: true }) as unknown as CsvRecord[];
  } catch (e) {
    // The parser's own words ("Quote Not Closed...") say more than "invalid CSV", and they point at the line.
    ok("parses", "The CSV parses", false, `${file.name}: ${oneLine(e instanceof Error ? e.message : String(e))}`);
    return;
  }
  const header = records[0]?.record ?? [];
  const data = records.slice(1);

  // Q77: a row with a stray unquoted comma has every cell after it shifted one column along, so the url column
  // holds a source name and the date column holds a url. That is a broken file, not a content problem: it fails
  // `parses`, and the row checks below leave it out rather than compare cells that are in the wrong place.
  const ragged = data.filter((r) => r.record.length !== header.length);
  ok("parses", "The CSV parses", ragged.length === 0, ragged.length ? raggedDetail(file.name, header.length, ragged) : `${file.name}: ${header.length} columns`);

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

  const rows = data.filter((r) => r.record.length === header.length).map((r) => r.record);
  urlColumnCheck(header, rows, ok);
  duplicateCheck(header, rows, ragged.length, ok);
  freshnessCheck(header, rows, ragged.length, input, ok);
}

/** "row 6 has 6 fields, the header has 5": the row number is the line a user would see opening the file. */
function raggedDetail(name: string, headerWidth: number, ragged: CsvRecord[]): string {
  const first = ragged[0];
  const more = ragged.length - 1;
  return `${name}: row ${first.info.lines} has ${first.record.length} fields, the header has ${headerWidth}${more ? ` (and ${more} more row${more > 1 ? "s" : ""} with a different field count)` : ""}`;
}

const urlColumn = (header: string[]) => header.findIndex((h) => /^(url|link|href|source_url)$/i.test(h.trim()));

// The url column is what the duplicate check keys on, so a cell that is not a link is named here instead of being
// counted as one more distinct source (a shifted "WION" used to pass as a URL).
function urlColumnCheck(header: string[], rows: string[][], ok: Push) {
  const urlAt = urlColumn(header);
  if (urlAt < 0) return;
  const values = rows.map((row) => (row[urlAt] ?? "").trim()).filter(Boolean); // a blank cell is "no link", not a broken one
  const bad = [...new Set(values.filter((v) => !/^https?:\/\//i.test(v)))];
  ok(
    "urls",
    "The url column holds links",
    bad.length === 0,
    bad.length ? `not a url: ${bad.slice(0, 3).join(", ")}${bad.length > 3 ? ` (and ${bad.length - 3} more)` : ""}` : `${values.length} links`,
  );
}

// Padding is the failure this catches: the same story under three titles, or the same row twice. Identity is the
// URL when there is one - titles and summaries are exactly what a model varies while repeating itself.
function duplicateCheck(header: string[], data: string[][], skipped: number, ok: Push) {
  const urlAt = urlColumn(header);
  const keys = data.map((row) => (urlAt >= 0 ? (row[urlAt] ?? "").trim().toLowerCase() : row.join("").toLowerCase()));
  // A row with a blank URL has no identity to compare, so it leaves both sides of the count: counting it in the
  // total while dropping it from the distinct set failed a file in which nothing was actually repeated.
  const keyed = keys.filter(Boolean);
  const distinct = new Set(keyed).size;
  const what = urlAt >= 0 ? "distinct urls" : "distinct rows";
  const blank = data.length - keyed.length;
  ok(
    "duplicates",
    "No row is a duplicate of another",
    distinct === keyed.length,
    `${data.length} rows, ${distinct} ${what}${notes(blank ? `${blank} with no ${urlAt >= 0 ? "url" : "content"}` : "", skipped)}`,
  );
}

// Q77: every check that drops a row says so in its own detail, so a green tick can never hide a row nobody read.
function notes(own: string, skipped: number): string {
  const parts = [own, skipped ? `${skipped} skipped: field count does not match the header` : ""].filter(Boolean);
  return parts.length ? `; ${parts.join(", ")}` : "";
}

// A model that cannot search answers from memory, and the giveaway is the dates. Only run when the instructions
// ask for something recent, and only when the file has a date column to read.
function freshnessCheck(header: string[], data: string[][], skipped: number, input: EvaluateInput, ok: Push) {
  const days = freshnessWindow(input.prompt);
  if (days === null) return;
  const dateAt = header.findIndex((h) => /(date|published|updated|_at)$/i.test(h.trim()));
  if (dateAt < 0) return;
  const today = Date.parse(input.today);
  if (Number.isNaN(today)) return;
  const stamps = data.map((row) => Date.parse((row[dateAt] ?? "").trim()));
  const dated = stamps.filter((t) => !Number.isNaN(t));
  const undated = stamps.length - dated.length;
  const cutoff = today - days * 86_400_000;
  const stale = dated.filter((t) => t < cutoff).length;
  // Q77: a row whose date cannot be read is not evidence of freshness. It used to drop out of the denominator,
  // which let a file of undated rows pass a check that asked for the last 7 days; now it counts as not fresh.
  const notFresh = stale + undated;
  const oldest = dated.length ? `, oldest ${new Date(Math.min(...dated)).toISOString().slice(0, 10)}` : "";
  const counted = data.length;
  ok(
    "freshness",
    `The rows are from the last ${days} days`,
    // More than half not fresh, not one: a single old backgrounder in a list of fresh news is not a failed run.
    notFresh * 2 <= counted,
    `${notFresh ? `${notFresh} of ${counted} rows are not from the last ${days} days` : `${counted} rows`}${oldest}${notes(undated ? `${undated} with no readable date` : "", skipped)}`,
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

  // Q61: "use the connected DeepWiki server if it helps, otherwise search the web" leaves the route to the run, so
  // a web-only answer is not a broken promise. The check is recorded either way - it is evidence a reader wants -
  // but it only fails when the instructions made the connection the required route.
  if (!connectionRequired(input.prompt, named)) {
    ok(
      "connection_used",
      `The ${named} connection was offered`,
      true,
      used.length ? `connection mentioned, not required; used anyway: ${used.join(", ")}` : `connection mentioned, not required; tools used: ${tools.join(", ")}`,
    );
    return;
  }
  ok(
    "connection_used",
    `The ${named} connection was used`,
    used.length > 0,
    used.length ? used.join(", ") : `no ${prefix}__ tool call; tools used: ${tools.join(", ")}`,
  );
}

// A requirement reads "must", "only", or "using/through/with the connected X"; an offer softens it in the same
// breath ("if it helps", "optionally", "or search the web"). Both are read in the sentence that names the
// connection, because a softener two sentences away is qualifying something else.
const REQUIRES = /\b(?:must|only)\b|\b(?:use|using|used|through|via|with)\s+(?:the\s+)?connected\b/i;
const OPTIONAL = /\b(?:if it helps|if useful|if available|if possible|if you (?:can|like|want)|optionally|where possible|you may|feel free|otherwise)\b|\bor\s+(?:search|use|fetch|look|fall back|the web)\b/i;

/** Whether the instructions make the connection the required route, rather than one option among others. */
export function connectionRequired(prompt: string, named: string): boolean {
  const sentence = prompt.split(/(?<=[.!?])\s+/).find((s) => new RegExp(`\\b${named}\\b`, "i").test(s)) ?? prompt;
  if (OPTIONAL.test(sentence)) return false;
  return REQUIRES.test(sentence);
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

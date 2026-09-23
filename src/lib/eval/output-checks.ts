import type { Check } from "@/contracts/eval";
import { spreadsheetBytes } from "./file-view";

// The files the output tools render - a chart (.svg) and a spreadsheet (.xlsx) - get a check each, as a CSV does.
// Our own code draws them, so what goes wrong is a file cut off or empty, not a design choice; these checks read
// what is cheap to read and name the file in every detail.

type File = { name: string; content: string };

// ---- the chart ---------------------------------------------------------------------------------------------------

export function chartCheck(file: File): Check {
  const svg = file.content;
  const problems: string[] = [];
  const broken = wellFormedProblem(svg);
  if (broken) problems.push(broken);
  const title = titleOf(svg);
  if (!title.text) problems.push("no title");
  // Marks are the data vega draws, each labelled role="graphics-symbol" (a bar, a point, a slice). The title and the
  // axes carry the same role, so they are left out: a chart of axes and a title has drawn no data.
  const marks = [...svg.matchAll(/<[^>]*\brole="graphics-symbol"[^>]*>/g)].filter((m) => !/aria-roledescription="(title|axis|legend)"/.test(m[0])).length;
  // Text labels are the axis labels and legends; a title drawn as text is not a label.
  const labels = [...svg.matchAll(TEXT)].filter((m) => textOf(m[1])).length - (title.drawn ? 1 : 0);
  if (!broken && marks + labels <= 0) problems.push("nothing drawn: no mark and no text label");
  return {
    id: "chart",
    label: `${file.name} is a readable chart`,
    ok: problems.length === 0,
    detail: `${file.name}: ${problems.length ? problems.join("; ") : `well-formed, ${marks} marks, ${labels} text labels, title "${title.text}"`}`,
  };
}

// A tag-balance check, not a full XML parser (the stack has none, and it would be a dependency for one check): it
// catches what actually goes wrong - a file cut off part-way, or text that is not an SVG at all.
const TAG = /<(\/?)([A-Za-z][\w:.-]*)(?:"[^"]*"|'[^']*'|[^'">])*?(\/?)>/g; // quoted values are skipped whole: they may hold ">"

function wellFormedProblem(svg: string): string | null {
  const body = svg
    .replace(/<\?[\s\S]*?\?>/g, "") // <?xml ... ?>
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .trim();
  if (!/^<svg\b/.test(body)) return "it does not start with <svg>";
  const open: string[] = [];
  for (const [, closing, name, selfClosing] of body.matchAll(TAG)) {
    if (selfClosing) continue;
    if (!closing) {
      open.push(name);
      continue;
    }
    const last = open.pop();
    if (last !== name) return `</${name}> closes <${last ?? "nothing"}>`;
  }
  return open.length ? `<${open[open.length - 1]}> is never closed` : null;
}

const TEXT = /<text\b[^>]*>([\s\S]*?)<\/text>/g;

// What a <text> element reads: a long title the chart tool breaks onto two lines is two <tspan>s inside it, and
// reading only up to the first "<" found nothing there - a correct chart failed as "no title" (production, 2026-09-23).
const textOf = (inner: string) => inner.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** The standard <title> element, or the title vega draws as a text mark labelled "title". */
function titleOf(svg: string): { text: string; drawn: boolean } {
  const own = svg.match(/<title\b[^>]*>([^<]*)<\/title>/)?.[1]?.trim();
  if (own) return { text: own, drawn: false };
  const inner = svg.match(/aria-roledescription="title"[^>]*>\s*<text\b[^>]*>([\s\S]*?)<\/text>/)?.[1];
  const drawn = inner ? textOf(inner) : "";
  return drawn ? { text: drawn, drawn: true } : { text: "", drawn: false };
}

// ---- the spreadsheet ---------------------------------------------------------------------------------------------

export function spreadsheetCheck(file: File): Check {
  const label = `${file.name} is a readable spreadsheet`;
  const { bytes, size } = spreadsheetBytes(file.content);
  if (size === 0) return { id: "spreadsheet", label, ok: false, detail: `${file.name} is empty` };
  if (!bytes) {
    // Only "(mime, n bytes)" reached the evaluator: the size is all there is to check, and the detail says so.
    return { id: "spreadsheet", label, ok: true, detail: `${file.name}: ${size} bytes (only its size reached the evaluator, not its bytes)` };
  }
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK": an .xlsx is a zip archive of XML parts
  return {
    id: "spreadsheet",
    label,
    ok: zip,
    detail: zip ? `${file.name}: a workbook, ${size} bytes` : `${file.name}: not a workbook - an .xlsx is a zip archive and this file does not start as one`,
  };
}

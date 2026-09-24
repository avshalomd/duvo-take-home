import { parseInline } from "./markdown";

const SHOWN = 3; // a few lines: enough to recognise the file, few enough that the tile stays a tile
const LONGEST = 200; // characters per line the page carries: the tile clips a line to its width anyway

// A markdown table's divider row ("|---|:--:|"): a mark, not a line of text
const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const HEADING = /^\s*#{1,6}\s+/;
const BULLET = /^\s*[-*+]\s+/;

/**
 * How many lines of text a .md or .txt file has and its first few, for the file's tile (UX QA U21). Lines of text, not
 * lines of the file: blank lines are not counted, so the count and the preview agree. A markdown file is read as its
 * words (headings, bullets, bold, `code` and links without their marks); a plain text file is shown as it is.
 * Read on the server, as the CSV tile's facts are.
 */
export function textSummary(content: string, name: string): { lines: number; preview: string[] } {
  const markdown = name.toLowerCase().endsWith(".md");
  const lines = content
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .filter((line) => !(markdown && TABLE_DIVIDER.test(line)));
  const preview = lines.slice(0, SHOWN).map((line) => (markdown ? asWords(line) : line.trim()).slice(0, LONGEST));
  return { lines: lines.length, preview };
}

function asWords(line: string): string {
  if (HEADING.test(line)) return plain(line.replace(HEADING, ""));
  if (BULLET.test(line)) return `• ${plain(line.replace(BULLET, ""))}`;
  return plain(line.trim());
}

function plain(text: string): string {
  return parseInline(text.trim())
    .map((span) => span.text)
    .join("");
}

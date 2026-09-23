// The agent's report is markdown-ish prose. This parses the four things it actually writes - headings, blank-line
// paragraphs, bullet/number lists, and bold / `code` / [links] inside them - into blocks the renderer maps over.
// A parser, not a renderer, so the rules are testable without a DOM; no library for four rules.
export type Inline = { text: string; bold?: boolean; code?: boolean; href?: string };
export type Block =
  | { kind: "heading"; level: number; spans: Inline[] }
  | { kind: "paragraph"; spans: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "table"; header: Inline[][]; rows: Inline[][][] }; // Q97: agents write comparison tables

// One pass, three alternatives: **bold**, `code`, [text](href). Anything else stays plain text.
// The href part takes balanced brackets - `(...)` one level deep - so a URL that contains a bracket is consumed
// whole rather than leaving a stray ")" behind on the page (Q50).
const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))*)\)/g;

// The href is the model's text, so it is not trusted: only the two schemes a report ever needs become a link.
// Anything else (javascript:, data:, file:, vbscript:) is shown as the words it linked, with no href at all (Q57).
function linkable(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

export function parseInline(text: string): Inline[] {
  const spans: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) spans.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) spans.push({ text: m[1], bold: true });
    else if (m[2] !== undefined) spans.push({ text: m[2], code: true });
    else spans.push(linkable(m[4]) ? { text: m[3], href: m[4] } : { text: m[3] });
    last = m.index + m[0].length;
  }
  if (last < text.length) spans.push({ text: text.slice(last) });
  return spans;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/; // |---|:---:| - the line that makes pipes a table

/** "| a | **b** |" -> the cells' inline spans. */
function cells(line: string): Inline[][] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => parseInline(c.trim()));
}

// "Report", "Final report:", "The report" - an opening heading that only names what the page already names (Q144)
const REPORT_TITLE = /^(the |final )?report:?$/i;

/** The report as the page shows it, under its own "Report" heading: an opening heading that repeats it is dropped. */
export function reportBlocks(text: string): Block[] {
  const blocks = parseMarkdown(text);
  const first = blocks[0];
  const repeatsTitle = first?.kind === "heading" && REPORT_TITLE.test(first.spans.map((s) => s.text).join("").trim());
  return repeatsTitle ? blocks.slice(1) : blocks;
}

export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const lines = text.split("\n");

  // a paragraph runs until a blank line or any other block starts: that is the only buffer this parser needs
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", spans: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };
  // consecutive bullets group by appending to the last block when it is already a list of the same kind
  const openList = (ordered: boolean) => {
    flushParagraph();
    const last = blocks.at(-1);
    if (last?.kind === "list" && last.ordered === ordered) return last;
    const list = { kind: "list" as const, ordered, items: [] as Inline[][] };
    blocks.push(list);
    return list;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = HEADING.exec(line);
    const item = BULLET.exec(line) ?? NUMBER.exec(line);

    // a table is a pipe row followed by its separator rule; the rows run until the pipes stop
    if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[i + 1] ?? "")) {
      flushParagraph();
      const header = cells(line);
      const rows: Inline[][][] = [];
      for (i += 2; i < lines.length && TABLE_ROW.test(lines[i]); i++) {
        const row = cells(lines[i]).slice(0, header.length); // a long row is cut, a short one padded below
        rows.push([...row, ...Array.from({ length: header.length - row.length }, (): Inline[] => [])]);
      }
      i--; // the for loop's own i++ moves to the line after the table
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    if (!line.trim()) flushParagraph();
    else if (heading) {
      flushParagraph();
      blocks.push({ kind: "heading", level: heading[1].length, spans: parseInline(heading[2]) });
    } else if (item) openList(NUMBER.test(line)).items.push(parseInline(item[1]));
    else paragraph.push(line.trim());
  }
  flushParagraph();
  return blocks;
}

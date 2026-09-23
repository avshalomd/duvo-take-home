// The agent's report is markdown-ish prose. This parses the four things it actually writes - headings, blank-line
// paragraphs, bullet/number lists, and bold / `code` / [links] inside them - into blocks the renderer maps over.
// A parser, not a renderer, so the rules are testable without a DOM; no library for four rules.
export type Inline = { text: string; bold?: boolean; code?: boolean; href?: string };
export type Block =
  | { kind: "heading"; level: number; spans: Inline[] }
  | { kind: "paragraph"; spans: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] };

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

export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

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

  for (const line of text.split("\n")) {
    const heading = HEADING.exec(line);
    const item = BULLET.exec(line) ?? NUMBER.exec(line);

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

// The agent's report is markdown-ish prose. This parses the four things it actually writes - headings, blank-line
// paragraphs, bullet/number lists, and bold / `code` / [links] inside them - into blocks the renderer maps over.
// A parser, not a renderer, so the rules are testable without a DOM; no library for four rules.
export type Inline = { text: string; bold?: boolean; code?: boolean; href?: string };
export type Block =
  | { kind: "heading"; level: number; spans: Inline[] }
  | { kind: "paragraph"; spans: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] };

// One pass, three alternatives: **bold**, `code`, [text](href). Anything else stays plain text.
const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(text: string): Inline[] {
  const spans: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) spans.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) spans.push({ text: m[1], bold: true });
    else if (m[2] !== undefined) spans.push({ text: m[2], code: true });
    else spans.push({ text: m[3], href: m[4] });
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
  let list: { ordered: boolean; items: Inline[][] } | null = null;

  // both buffers flush on any change of block type, so a bullet ends the paragraph above it
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", spans: parseInline(paragraph.join(" ")) });
    paragraph = [];
    if (list) blocks.push({ kind: "list", ...list });
    list = null;
  };

  for (const line of text.split("\n")) {
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    const numbered = NUMBER.exec(line);

    if (!line.trim()) flush();
    else if (heading) {
      flush();
      blocks.push({ kind: "heading", level: heading[1].length, spans: parseInline(heading[2]) });
    } else if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (paragraph.length || list?.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push(parseInline((bullet ?? numbered)![1]));
    } else {
      if (list) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}

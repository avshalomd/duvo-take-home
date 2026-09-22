// The agent's report is markdown-ish prose. This parses the four things it actually writes - headings, blank-line
// paragraphs, bullet/number lists, and bold / `code` / [links] inside them - into blocks the renderer can map over.
// A parser, not a renderer, so the behaviour is testable without a DOM; no library for four rules.
export type Inline = { text: string; bold?: boolean; code?: boolean; href?: string };
export type Block =
  | { kind: "heading"; level: number; spans: Inline[] }
  | { kind: "paragraph"; spans: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] };

export function parseInline(text: string): Inline[] {
  throw new Error("not implemented");
}

export function parseMarkdown(text: string): Block[] {
  throw new Error("not implemented");
}

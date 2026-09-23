import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "./markdown";

describe("parseInline", () => {
  it("marks **bold**, `code` and [links] and leaves the rest as plain text", () => {
    expect(parseInline("wrote **output.csv** with `title` see [source](https://a.test)")).toEqual([
      { text: "wrote " },
      { text: "output.csv", bold: true },
      { text: " with " },
      { text: "title", code: true },
      { text: " see " },
      { text: "source", href: "https://a.test" },
    ]);
  });

  it("leaves a lone asterisk alone, so prose is never mangled", () => {
    expect(parseInline("2 * 3 = 6")).toEqual([{ text: "2 * 3 = 6" }]);
  });

  // Q50: a URL with brackets in it is normal on Wikipedia; stopping at the first ")" left a stray bracket on screen
  it("consumes the whole (...) of a link, nested brackets included", () => {
    expect(parseInline("see [docs](https://a.test/x_(y)) now")).toEqual([
      { text: "see " },
      { text: "docs", href: "https://a.test/x_(y)" },
      { text: " now" },
    ]);
  });

  // Q57: the href comes from the model's text, so only the two schemes a report ever needs are turned into a link
  it("keeps a link the browser should not follow as plain text, with nothing left over", () => {
    expect(parseInline("[x](javascript:alert(1))")).toEqual([{ text: "x" }]);
    expect(parseInline("a [file](file:///etc/passwd) b")).toEqual([{ text: "a " }, { text: "file" }, { text: " b" }]);
    expect(parseInline("[img](data:text/html,<script>)")).toEqual([{ text: "img" }]);
  });

  it("links http as well as https, and nothing else", () => {
    expect(parseInline("[a](http://a.test)")).toEqual([{ text: "a", href: "http://a.test" }]);
  });
});

describe("parseMarkdown", () => {
  it("splits on blank lines so a plain report reads as paragraphs", () => {
    const blocks = parseMarkdown("I fetched 10 stories.\n\nI could not reach the RSS feed.");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ kind: "paragraph", spans: [{ text: "I fetched 10 stories." }] });
  });

  it("groups consecutive bullets into one list", () => {
    const blocks = parseMarkdown("Did:\n- searched the web\n- wrote output.csv");
    expect(blocks[0]).toEqual({ kind: "paragraph", spans: [{ text: "Did:" }] });
    expect(blocks[1]).toEqual({
      kind: "list",
      ordered: false,
      items: [[{ text: "searched the web" }], [{ text: "wrote output.csv" }]],
    });
  });

  it("reads a numbered list as ordered", () => {
    expect(parseMarkdown("1. first\n2. second")).toEqual([
      { kind: "list", ordered: true, items: [[{ text: "first" }], [{ text: "second" }]] },
    ]);
  });

  it("reads ## as a heading with its level", () => {
    expect(parseMarkdown("## What I did")).toEqual([
      { kind: "heading", level: 2, spans: [{ text: "What I did" }] },
    ]);
  });

  it("returns nothing for an empty report", () => {
    expect(parseMarkdown("   ")).toEqual([]);
  });
});

// Q97: a report's comparison table showed as rows of raw pipes
describe("parseMarkdown - tables", () => {
  it("reads a pipe table with its separator row into a header and rows, with inline marks in the cells", () => {
    const text = ["Top stories:", "", "| Title | Source |", "|---|:---:|", "| **Chips** | Reuters |", "| AI act | [EU](https://eu.test) |"].join("\n");
    expect(parseMarkdown(text)).toEqual([
      { kind: "paragraph", spans: [{ text: "Top stories:" }] },
      {
        kind: "table",
        header: [[{ text: "Title" }], [{ text: "Source" }]],
        rows: [
          [[{ text: "Chips", bold: true }], [{ text: "Reuters" }]],
          [[{ text: "AI act" }], [{ text: "EU", href: "https://eu.test" }]],
        ],
      },
    ]);
  });

  it("pads a short row to the header's width and cuts a long one", () => {
    const [table] = parseMarkdown("| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |");
    expect(table).toMatchObject({ rows: [[[{ text: "1" }], []], [[{ text: "1" }], [{ text: "2" }]]] });
  });

  it("keeps pipes without a separator row as a paragraph: it is prose that happens to contain a pipe", () => {
    expect(parseMarkdown("| not | a table |")).toEqual([{ kind: "paragraph", spans: [{ text: "| not | a table |" }] }]);
  });
});

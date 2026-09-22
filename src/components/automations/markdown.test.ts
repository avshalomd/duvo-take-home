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

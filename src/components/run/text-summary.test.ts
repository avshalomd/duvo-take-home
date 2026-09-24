import { describe, expect, it } from "vitest";
import { textSummary } from "./text-summary";

// UX QA U21 (the owner's call): a .md or .txt tile showed only "73 bytes". It shows its first lines and how many
// lines of text it has, as a CSV tile shows its rows.
describe("textSummary - what a text file's tile says about it", () => {
  it("counts the lines that have text and keeps the first three as the preview", () => {
    const summary = textSummary("Autumn moonlight\na worm digs silently\n\ninto the chestnut\nthe end\n", "haiku.txt");
    expect(summary).toEqual({ lines: 4, preview: ["Autumn moonlight", "a worm digs silently", "into the chestnut"] });
  });

  it("counts one line as one", () => {
    expect(textSummary("An old silent pond", "pond.txt")).toEqual({ lines: 1, preview: ["An old silent pond"] });
  });

  it("says an empty file has no lines", () => {
    expect(textSummary("", "empty.txt")).toEqual({ lines: 0, preview: [] });
    expect(textSummary("\n  \n", "blank.md")).toEqual({ lines: 0, preview: [] });
  });

  it("reads a markdown file as words, not its marks: headings, bullets, bold, code and links", () => {
    const md = "# Moon facts\n\n- It is **384,400 km** away\n* It has no `air`\n1. See [NASA](https://nasa.gov)\n";
    expect(textSummary(md, "notes.md")).toEqual({ lines: 4, preview: ["Moon facts", "• It is 384,400 km away", "• It has no air"] });
  });

  it("leaves a markdown table's divider out of the preview and the count", () => {
    const md = "| Measure | Value |\n|---|---|\n| Distance | 384,400 km |";
    expect(textSummary(md, "table.md")?.lines).toBe(2);
    expect(textSummary(md, "table.md")?.preview).toEqual(["| Measure | Value |", "| Distance | 384,400 km |"]);
  });

  it("keeps a plain text file's marks as they are", () => {
    expect(textSummary("# not a heading here", "notes.txt")?.preview).toEqual(["# not a heading here"]);
  });

  it("cuts a very long line: the tile clips it anyway, and the page need not carry it", () => {
    const [line] = textSummary("x".repeat(5000), "long.txt")!.preview;
    expect(line.length).toBeLessThanOrEqual(200);
  });
});

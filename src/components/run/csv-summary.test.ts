import { describe, expect, it } from "vitest";
import { csvSummary } from "./csv-summary";

// The CSV tile says how many rows the file has and what its first columns are, read on the server from the file.
describe("csvSummary - the rows and columns of a CSV the agent wrote", () => {
  it("counts the data rows under the header and returns the header's columns", () => {
    expect(csvSummary("title,url\nA,https://a.test\nB,https://b.test\n")).toEqual({ rows: 2, columns: ["title", "url"] });
  });

  it("counts a quoted value with a line break in it as one row", () => {
    expect(csvSummary('title,summary\nA,"two\nlines"\nB,one\n')).toEqual({ rows: 2, columns: ["title", "summary"] });
  });

  it("skips blank lines and tolerates a ragged row", () => {
    expect(csvSummary("a,b\n1,2\n\n3\n")).toEqual({ rows: 2, columns: ["a", "b"] });
  });

  it("is null for an empty file or one that is not CSV at all", () => {
    expect(csvSummary("")).toBeNull();
    expect(csvSummary('a,"unterminated\n')).toBeNull();
  });
});

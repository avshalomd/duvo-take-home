import { describe, expect, it } from "vitest";
import type { AutomationTemplate } from "@/contracts/automation";
import type { Check, EvaluateInput } from "@/contracts/eval";
import { failureWords, plainCheckReason } from "./check-words";
import { runChecks } from "./checks";

// qa-ai U10: a failed check was named by its pass label - "the CSV parses (in countries.csv, row 5 has 6 fields...)" -
// which reads as if the CSV parsed. Each failure is said as what went wrong, produced here through the real checks, so
// a change in a check's wording shows up in this file.

const base: EvaluateInput = {
  prompt: "Fetch the latest AI news and save them into output.csv with title, source, url, published_at, summary. At least 2 rows, last 7 days.",
  runStatus: "succeeded",
  report: "Wrote output.csv.",
  plan: null,
  files: [],
  today: "2026-09-22",
};
const header = "title,source,url,published_at,summary\n";
const row = (i: number, url = `https://n.example/${i}`, date = "2026-09-21") => `"Story ${i}",Source,${url},${date},"Summary"\n`;
const csv = (content: string, name = "output.csv") => [{ name, content }];
const failing = (over: Partial<EvaluateInput>, id: string): Check => {
  const found = runChecks({ ...base, ...over }).find((c) => c.id === id && !c.ok);
  if (!found) throw new Error(`the input does not fail '${id}'`);
  return found;
};
const template: AutomationTemplate = {
  instructions: "Find the news about {input} and save it to news.csv.",
  intent: "news digest",
  expectedOutputs: ["news.csv"],
  outputFormat: "",
  steps: ["Search the web for news about {input}", "Open each story to confirm its date"],
  connections: [],
};

describe("failureWords: each failed check says what went wrong", () => {
  it("says a ragged CSV could not be read as a table, naming the row and the counts in values, with no chain of colons", () => {
    const check = failing({ files: csv("name,capital,population\nA,B,1\nB,C,2\nC,D,3\nE,F,4\nFrance, Paris, 68, x, y, z\n", "countries.csv") }, "parses");
    expect(failureWords(check)).toBe("countries.csv could not be read as a table (row 6 has 6 values, the header has 3)");
  });

  it("never opens with the check's pass label", () => {
    const every: Check[] = [
      failing({ runStatus: "failed", report: "Reached the turn limit." }, "completed"),
      failing({ prompt: "Using the connected DeepWiki server, write output.csv.", toolsUsed: ["WebFetch", "Write"], files: csv("a,b\n1,2\n") }, "connection_used"),
      failing({ files: [] }, "file_expected"),
      failing({ files: [{ name: "chart.png", content: "x" }] }, "extension"),
      failing({ prompt: "Write notes.md.", files: [{ name: "notes.md", content: " " }] }, "content"),
      failing({ files: csv(header + row(1)) }, "rows"),
      failing({ files: csv("headline,link\nA,https://a.example\nB,https://b.example\n") }, "columns"),
      failing({ files: csv(header + row(1, "WION") + row(2)) }, "urls"),
      failing({ files: csv(header + row(1) + row(1)) }, "duplicates"),
      failing({ files: csv(header + row(1, undefined, "2024-05-13") + row(2, undefined, "2024-04-18")) }, "freshness"),
      failing({ files: [{ name: "prices.svg", content: "<svg><g>" }] }, "chart"),
      failing({ files: [{ name: "prices.xlsx", content: Buffer.from("not a zip").toString("base64") }] }, "spreadsheet"),
      failing({ template, files: csv(header + row(1) + row(2)) }, "template_outputs"),
      failing({ template, plan: { intent: "", expectedOutputs: [], sources: [], steps: [{ index: 0, title: "Write a summary", status: "done" }] }, files: csv(header + row(1) + row(2), "news.csv") }, "template_steps"),
    ];
    for (const check of every) {
      const words = failureWords(check);
      expect(words.startsWith(check.label), `${check.id}: ${words}`).toBe(false);
      expect(words.length, check.id).toBeGreaterThan(10);
    }
  });

  it("says the short file, the missing columns, the old rows and the repeats in plain words", () => {
    expect(failureWords(failing({ files: csv(header + row(1)) }, "rows"))).toBe("output.csv has 1 row, and at least 2 were asked for");
    expect(failureWords(failing({ files: csv("headline,link\nA,https://a.example\nB,https://b.example\n") }, "columns"))).toMatch(/^output\.csv is missing the columns asked for \(title, source/);
    expect(failureWords(failing({ files: csv(header + row(1, undefined, "2024-05-13") + row(2, undefined, "2024-04-18")) }, "freshness"))).toMatch(/^output\.csv has old rows \(2 of 2 rows are not from the last 7 days/);
    expect(failureWords(failing({ files: csv(header + row(1) + row(1)) }, "duplicates"))).toMatch(/^output\.csv repeats rows \(only 1 of its 2 rows is different\)/);
    expect(failureWords(failing({ files: [] }, "file_expected"))).toBe("No file was written, though the instructions ask for one");
  });
});

describe("plainCheckReason: a stored reason, as older heal events and verdicts hold it", () => {
  it("reads 'label: detail' back as what went wrong", () => {
    expect(plainCheckReason("The CSV parses: countries.csv: row 5 has 6 fields, the header has 3")).toBe(
      "countries.csv could not be read as a table (row 5 has 6 values, the header has 3)",
    );
  });

  it("leaves a reason that is not a check's as it is", () => {
    expect(plainCheckReason("The task was not finished: Only 3 of 8 rows.")).toBeNull();
  });
});

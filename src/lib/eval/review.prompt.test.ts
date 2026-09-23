import { describe, expect, it } from "vitest";
import type { EvaluateInput } from "@/contracts/eval";
import { reviewInput } from "./review.prompt";

const input: EvaluateInput = {
  prompt: "Make a spreadsheet of the prices and a short note.",
  runStatus: "succeeded",
  report: "Wrote data.xlsx and notes.md.",
  plan: null,
  files: [
    { name: "data.xlsx", content: Buffer.from("PK\x03\x04 the rest of the workbook", "binary").toString("base64") },
    { name: "notes.md", content: "Prices are list prices." },
  ],
  today: "2026-09-23",
};

describe("reviewInput", () => {
  it("shows the reviewer a spreadsheet as what it is and its size, never its base64", () => {
    const text = reviewInput(input);
    expect(text).toContain("FILE data.xlsx");
    expect(text).toContain("(a spreadsheet file, 29 bytes)");
    expect(text).not.toContain(input.files[0].content);
  });

  it("shows a text file's own lines", () => {
    expect(reviewInput(input)).toContain("Prices are list prices.");
  });
});

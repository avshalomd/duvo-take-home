import { describe, expect, it } from "vitest";
import { briefParts } from "./brief";

describe("briefParts", () => {
  it("splits the brief around {input}, so the page can draw the input as a token", () => {
    expect(briefParts("Fetch the latest {input} news and save a CSV.")).toEqual([
      { kind: "text", text: "Fetch the latest " },
      { kind: "input" },
      { kind: "text", text: " news and save a CSV." },
    ]);
  });

  it("finds every {input}, at the start and at the end too", () => {
    expect(briefParts("{input} vs the market: compare {input}")).toEqual([
      { kind: "input" },
      { kind: "text", text: " vs the market: compare " },
      { kind: "input" },
    ]);
  });

  it("returns the text alone when there is no {input}", () => {
    expect(briefParts("Write audit.md")).toEqual([{ kind: "text", text: "Write audit.md" }]);
  });
});

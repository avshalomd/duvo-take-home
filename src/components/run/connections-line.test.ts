import { describe, expect, it } from "vitest";
import { connectionsLine } from "./connections-line";

// UX QA U24 (the owner's call): with four connections on, one chip each wrapped the floating composer onto three
// lines at 390 px. Several read as "DeepWiki and 3 more", with the whole list behind it.
describe("connectionsLine - the connections under the composer, in one line", () => {
  it("names the only one", () => {
    expect(connectionsLine(["DeepWiki"])).toEqual({ first: "DeepWiki", more: 0, label: "DeepWiki" });
  });

  it("names the first and counts the rest", () => {
    expect(connectionsLine(["DeepWiki", "Drive", "Mail", "Wiki"])).toEqual({ first: "DeepWiki", more: 3, label: "DeepWiki and 3 more" });
    expect(connectionsLine(["DeepWiki", "Drive"])).toEqual({ first: "DeepWiki", more: 1, label: "DeepWiki and 1 more" });
  });

  it("is null when none is on", () => {
    expect(connectionsLine([])).toBeNull();
  });
});

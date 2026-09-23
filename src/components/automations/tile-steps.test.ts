import { describe, expect, it } from "vitest";
import { tileSteps } from "./tile-steps";

describe("tileSteps (a gallery tile's mini thread)", () => {
  it("shows every step when there are four or fewer", () => {
    expect(tileSteps(["a", "b", "c"])).toEqual({ shown: ["a", "b", "c"], more: 0 });
  });

  it("shows the first four and counts the rest, so tiles stay one height", () => {
    expect(tileSteps(["a", "b", "c", "d", "e", "f"])).toEqual({ shown: ["a", "b", "c", "d"], more: 2 });
  });

  it("says how many more in words", () => {
    expect(tileSteps(["a", "b", "c", "d", "e"]).more).toBe(1);
  });
});

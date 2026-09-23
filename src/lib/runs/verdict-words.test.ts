import { describe, expect, it } from "vitest";
import { verdictWords } from "./verdict-words";

// A person's judgment of a run, said as who said it: the viewer, a named colleague, or nobody recorded (rows judged
// before the judge was stored). "You said" is only ever true.
const ME = "user-me";

describe("the words for a person's judgment", () => {
  it("says 'You said' when the viewer judged it", () => {
    expect(verdictWords("approved", { id: ME, name: "Sam" }, ME)).toBe("You said it looks right");
    expect(verdictWords("rejected", { id: ME, name: "Sam" }, ME)).toBe("You said it is not right");
  });

  it("names the colleague who judged it", () => {
    expect(verdictWords("approved", { id: "user-mia", name: "Mia Member" }, ME)).toBe("Mia Member said it looks right");
    expect(verdictWords("rejected", { id: "user-mia", name: "Mia Member" }, ME)).toBe("Mia Member said it is not right");
  });

  it("stays neutral when nobody was recorded, as on rows judged before it was stored", () => {
    expect(verdictWords("approved", null, ME)).toBe("Marked: looks right");
    expect(verdictWords("rejected", null, ME)).toBe("Marked: not right");
  });

  it("stays neutral when the judge's account is gone and has no name to show", () => {
    expect(verdictWords("approved", { id: "user-gone", name: null }, ME)).toBe("Marked: looks right");
  });
});

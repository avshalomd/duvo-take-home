import { describe, expect, it } from "vitest";
import { orderForPicker } from "./picker";

const run = (id: string, outcome: "pass" | "pass_with_notes" | "fail" | "unknown" | "cannot_do" | "needs_answer" | null) => ({ id, outcome });

// qa-ai F3: a run that could not do the task, or asked a question, did no work an automation could repeat
describe("orderForPicker - runs that did not do the work", () => {
  it("puts them after the runs that did well and the ones nobody checked, marked in their own words", () => {
    const ordered = orderForPicker([run("cant", "cannot_do"), run("asks", "needs_answer"), run("ok", "pass"), run("none", null)]);
    expect(ordered.map((r) => r.id)).toEqual(["ok", "none", "cant", "asks"]);
    expect(Object.fromEntries(ordered.map((r) => [r.id, r.mark]))).toMatchObject({ cant: "Could not be done", asks: "Needs your answer" });
  });
});

describe("orderForPicker (Q108)", () => {
  it("lists the runs that did well first, keeping the newest-first order inside each group", () => {
    const ordered = orderForPicker([run("a", "fail"), run("b", "pass"), run("c", null), run("d", "pass_with_notes"), run("e", "pass")]);
    expect(ordered.map((r) => r.id)).toEqual(["b", "d", "e", "c", "a"]);
  });

  it("puts a run nobody checked before one that did not pass", () => {
    const ordered = orderForPicker([run("failed", "fail"), run("unchecked", "unknown")]);
    expect(ordered.map((r) => r.id)).toEqual(["unchecked", "failed"]);
  });

  it("marks only the runs that did not do well, in plain words", () => {
    const marks = Object.fromEntries(
      orderForPicker([run("ok", "pass"), run("notes", "pass_with_notes"), run("none", null), run("unknown", "unknown"), run("bad", "fail")]).map((r) => [r.id, r.mark]),
    );
    expect(marks).toEqual({ ok: null, notes: null, none: "Not checked", unknown: "Not checked", bad: "Did not pass its check" });
  });
});

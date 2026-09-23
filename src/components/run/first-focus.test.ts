import { describe, expect, it } from "vitest";
import { mayTakeFocus } from "./first-focus";

// A stand-in for the document: what has focus, and whether a menu or a dialog is open (by the selector asked for)
const doc = (active: "body" | "none" | "button", open: string[] = []) => {
  const body = { id: "body" } as unknown as Element;
  const activeElement = active === "body" ? body : active === "none" ? null : ({ id: "button" } as unknown as Element);
  return {
    body,
    activeElement,
    querySelector: (selector: string) => (open.some((role) => selector.includes(`[role="${role}"]`)) ? ({} as Element) : null),
  };
};

// The first visit's box takes the focus when Home arrives - but the page streams in, and a person who opened the
// user menu in that second lost it when the box took the focus and the menu closed (found by the auth package).
describe("mayTakeFocus - the first visit's box takes the focus only when nobody else is using it", () => {
  it("takes it when nothing has the focus", () => {
    expect(mayTakeFocus(doc("body"))).toBe(true);
    expect(mayTakeFocus(doc("none"))).toBe(true);
  });

  it("leaves it where the person put it", () => {
    expect(mayTakeFocus(doc("button"))).toBe(false);
  });

  it("leaves it while a menu or a dialog is open, wherever the focus is", () => {
    expect(mayTakeFocus(doc("body", ["menu"]))).toBe(false);
    expect(mayTakeFocus(doc("body", ["dialog"]))).toBe(false);
  });
});

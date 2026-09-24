import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Automation } from "@/contracts/automation";

vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import { GalleryTile } from "./gallery-tile";

const automation = {
  id: "a1",
  name: "Concept comparison",
  command: "compare",
  status: "active",
  inputLabel: "Two concepts",
  template: { instructions: "Compare {input}", intent: "", expectedOutputs: ["a table"], outputFormat: "", steps: ["Identify the two concepts", "Compare them"], connections: [] },
} as unknown as Automation;

// UX QA U13: a screen reader read "Ready, Not started, Identify the two concepts, Not started, ..." in the gallery,
// where the steps are a plan, not a run
describe("GalleryTile", () => {
  it("lists the steps with no run state for a screen reader", () => {
    const html = renderToStaticMarkup(<GalleryTile automation={automation} />);
    expect(html).toContain("Identify the two concepts");
    expect(html).not.toContain("Not started");
  });
});

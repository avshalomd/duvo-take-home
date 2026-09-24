import { describe, expect, it } from "vitest";
import { tabShown } from "./tab-choice";

// Speed: a Settings tab changed nothing on screen until the server answered. A skeleton would show at once, but React
// holds a shown fallback for 300 ms, longer than a tab takes when the server is warm. So the pill moves at the click
// and the page follows as soon as it is ready.
describe("tabShown - which Settings tab the segmented control marks", () => {
  it("marks the page's own tab when nothing was clicked", () => {
    expect(tabShown("/settings/limits", null)).toBe("/settings/limits");
  });

  it("marks the clicked tab at once, while the address is still the old one", () => {
    expect(tabShown("/settings/connections", { from: "/settings/connections", href: "/settings/members" })).toBe("/settings/members");
  });

  it("follows the address again once it has changed, wherever it went", () => {
    expect(tabShown("/settings/members", { from: "/settings/connections", href: "/settings/members" })).toBe("/settings/members");
    expect(tabShown("/settings/limits", { from: "/settings/connections", href: "/settings/members" })).toBe("/settings/limits");
  });
});

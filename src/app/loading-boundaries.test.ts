import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { skeletonFor } from "./(app)/skeleton-for";

// Speed: a click on Home or on a Settings tab changed nothing on screen until the server had answered, because a
// dynamic page without a loading boundary is not prefetched at all. Each page now has one on its way, so the click
// shows the page's shape at once (the boundary is prefetched) and the content streams into it.
const at = (file: string) => existsSync(join(__dirname, file));

describe("the loading boundaries of the pages behind sign-in", () => {
  it("Home sits in its own group, so the app's boundary is shown when Home is opened from another page", () => {
    expect(at("(app)/(home)/page.tsx")).toBe(true);
    expect(at("(app)/page.tsx")).toBe(false);
    expect(at("(app)/loading.tsx")).toBe(true);
  });

  // a boundary inside the group would be keyed by the page and its ?run=, and show its skeleton on every run opened
  it("Home keeps no boundary of its own, so opening a run replaces the sheet in one commit", () => {
    expect(at("(app)/(home)/loading.tsx")).toBe(false);
  });

  it("Settings has one under its title and tabs, so a tab shows its skeleton at once", () => {
    expect(at("(app)/settings/loading.tsx")).toBe(true);
  });
});

// The app's boundary stands in for any page whose own boundary was not prefetched yet: it draws that page's shape
describe("skeletonFor - the shape the app's loading boundary draws, by address", () => {
  it("draws Home for Home, with or without a run open", () => {
    expect(skeletonFor("/")).toBe("home");
  });

  it("draws the gallery, an automation and the new-automation page each in its own shape", () => {
    expect(skeletonFor("/automations")).toBe("gallery");
    expect(skeletonFor("/automations/new")).toBe("new-automation");
    expect(skeletonFor("/automations/6d63b0b5-63f5-4cf3-ae2f-8cf70f116a80")).toBe("automation");
  });

  it("draws Settings, its title and tabs included, for every Settings page", () => {
    for (const path of ["/settings", "/settings/connections", "/settings/limits", "/settings/members"]) expect(skeletonFor(path)).toBe("settings");
  });

  it("draws nothing it cannot name rather than the wrong page", () => {
    expect(skeletonFor("/somewhere-else")).toBe("none");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const address = vi.hoisted(() => ({ path: "/", search: "" }));
vi.mock("next/navigation", () => ({ usePathname: () => address.path, useSearchParams: () => new URLSearchParams(address.search) }));
vi.mock("@/components/auth/user-menu", () => ({ UserMenu: () => null }));

import { TopBar } from "./top-bar";

const render = () => renderToStaticMarkup(<TopBar userName="Sam" workspaceName="Acme" />);

beforeEach(() => {
  address.path = "/";
  address.search = "";
});

// Speed: Settings pointed at /settings, which only redirects to Connections, so every visit was two server round trips
describe("the Settings link", () => {
  it("opens Connections directly, without the redirect through /settings", () => {
    expect(render()).toMatch(/<a[^>]*href="\/settings\/connections"[^>]*>Settings<\/a>/);
    expect(render()).not.toContain('href="/settings"');
  });

  it("marks Settings as the current page on each of its tabs", () => {
    for (const path of ["/settings/connections", "/settings/limits", "/settings/members"]) {
      address.path = path;
      expect(render()).toMatch(/<a[^>]*aria-current="page"[^>]*>Settings<\/a>/);
    }
  });
});

// Review (frontend): the first Tab stop on a first visit to Home was "Skip to the run", a link to a run that is not there
describe("the Skip to the run link", () => {
  it("is offered on Home when a run is open", () => {
    address.search = "run=4f9c1d2e-0000-4000-8000-000000000001";
    expect(render()).toContain('href="#run"');
  });

  it("is not offered on Home's first visit, which has no run to skip to", () => {
    expect(render()).not.toContain("Skip to the run");
  });

  it("is not offered on other pages", () => {
    address.path = "/automations";
    address.search = "run=4f9c1d2e-0000-4000-8000-000000000001";
    expect(render()).not.toContain("Skip to the run");
  });
});

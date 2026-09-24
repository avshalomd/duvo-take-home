import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Speed: a click on a page link or a run in the rail changed nothing on screen until the server answered (Home has
// no loading skeleton, so a run can take the sheet's place in one commit). The clicked link now says it is opening.
const status = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", async (actual) => ({ ...(await actual<typeof import("next/link")>()), useLinkStatus: () => status }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/auth/user-menu", () => ({ UserMenu: () => null }));

import { RunsRail, type RailRun } from "@/components/run/runs-rail";
import { TopBar } from "./top-bar";

const run: RailRun = {
  id: "4f9c1d2e-0000-4000-8000-000000000001",
  prompt: "Summarise the week",
  title: "Summarise the week",
  tag: null,
  command: null,
  status: "succeeded",
  outcome: "pass",
  stopping: false,
  healAttempts: 0,
  createdAt: "2026-09-24T10:00:00.000Z",
};

const pendingMarks = (html: string) => html.match(/data-pending="true"/g)?.length ?? 0;

beforeEach(() => {
  status.pending = false;
});

describe("a link that is opening", () => {
  it("shows nothing extra while no navigation is under way", () => {
    expect(pendingMarks(renderToStaticMarkup(<TopBar userName="Sam" workspaceName="Acme" />))).toBe(0);
    expect(pendingMarks(renderToStaticMarkup(<RunsRail runs={[run]} />))).toBe(0);
  });

  it("marks each page in the top bar the moment it is clicked, before the page arrives", () => {
    status.pending = true;
    expect(pendingMarks(renderToStaticMarkup(<TopBar userName="Sam" workspaceName="Acme" />))).toBe(3); // Home, Automations, Settings
  });

  it("marks a run in the rail the moment it is clicked, before its sheet arrives", () => {
    status.pending = true;
    const html = renderToStaticMarkup(<RunsRail runs={[run]} />);
    expect(html).toMatch(new RegExp(`href="/\\?run=${run.id}"[^>]*>.*data-pending="true"`));
  });
});

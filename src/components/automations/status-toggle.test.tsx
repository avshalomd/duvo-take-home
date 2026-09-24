import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/automations/actions", () => ({ setStatusAction: vi.fn(async () => ({})) }));

import { StatusToggle } from "./status-toggle";

// Review (frontend): a refused Turn off replaced the line under the button with the reason, and a screen reader
// said nothing. The line is a polite live region, so the refusal is read out when it appears.
describe("Turn off and Turn on", () => {
  it.each([true, false])("keeps the line that says what it does, or why it was refused, in a live region (on: %s)", (active) => {
    const html = renderToStaticMarkup(<StatusToggle automationId="a1" command="audit" active={active} />);
    expect(html).toMatch(/<p aria-live="polite"[^>]*>[^<]*Nothing is deleted\.<\/p>/);
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DayStartsOver } from "./day-starts-over";

// UX QA U28: the reader's zone is known only in the browser. The server's render says UTC, and the browser swaps its
// own time in after hydration (useSyncExternalStore), so the two never disagree while React compares them.
describe("DayStartsOver", () => {
  it("renders the server's words, midnight UTC, as a time element with the instant", () => {
    const html = renderToStaticMarkup(<DayStartsOver resetsAt="2026-09-24T00:00:00.000Z" />);
    expect(html).toBe('<time dateTime="2026-09-24T00:00:00.000Z">at midnight UTC</time>');
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FileMeta } from "@/contracts/run";
import { ExampleFiles } from "./example-files";

const file = (name: string, quarantined = false): FileMeta => ({ name, mime: "text/plain", bytes: 12, encoding: "utf8", flags: [], quarantined });

// Review (frontend): an example card offered every file as a plain download, a held-back one too. Its download
// answered 409 and the browser showed a failed download with no reason; the card never said it was held back.
describe("the files on an example card", () => {
  it("offers a download for each file it made", () => {
    const html = renderToStaticMarkup(<ExampleFiles runId="r1" files={[file("facts.md")]} />);
    expect(html).toMatch(/<a[^>]*href="\/api\/runs\/r1\/files\/facts\.md"[^>]*download/);
  });

  it("never offers a held-back file as a plain download, and says why and where to take it anyway", () => {
    const html = renderToStaticMarkup(<ExampleFiles runId="r1" files={[file("facts.md"), file("keys.txt", true)]} />);
    expect(html).not.toContain('href="/api/runs/r1/files/keys.txt"');
    expect(html).toContain("keys.txt");
    expect(html).toContain("held back");
    expect(html).toContain("Open the full run to take it anyway.");
  });
});

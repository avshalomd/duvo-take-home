import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

// Review (frontend): the gallery's loading file was also the loading state of every page under it, so opening an
// automation flashed a gallery (a title over three tiles) before the two-column page jumped in. Each page under
// /automations now has a loading state laid out like itself: the same width and, for an automation, the same columns.
const here = (file: string) => join(__dirname, file);

async function skeleton(file: string): Promise<string> {
  expect(existsSync(here(file)), `${file} exists`).toBe(true);
  const { default: Loading } = await import(/* @vite-ignore */ here(file));
  return renderToStaticMarkup(<Loading />);
}

// the class of the page's first element with this marker, as written in its source
function pageClass(file: string, marker: RegExp): string {
  const found = readFileSync(here(file), "utf8").match(marker);
  expect(found, `${file} has ${marker}`).not.toBeNull();
  return found![1];
}

describe("the loading state under /automations", () => {
  it("of an automation has the page's width and its two columns: the document, and Try it beside it", async () => {
    const html = await skeleton("[id]/loading.tsx");
    expect(html).toContain(pageClass("[id]/page.tsx", /<main className="([^"]+)">/));
    expect(html).toContain(pageClass("[id]/page.tsx", /<div className="(grid [^"]+)">/));
  });

  it("of a new automation has the page's width, not the gallery's", async () => {
    const html = await skeleton("new/loading.tsx");
    expect(html).toContain(pageClass("new/page.tsx", /<main className="([^"]+)">/));
  });
});

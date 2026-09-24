import { existsSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

// Review (frontend): only Settings had an error boundary. A failed action or transition (Stop, Run again, the
// workspace menu) or a database hiccup while Home streamed replaced the whole app with Next's bare "Application
// error". Every page behind sign-in now has a calm one under the top bar, and the root layout has one of its own.
const raw = Object.assign(new Error("connect ECONNREFUSED ep-quiet-db.eu-central-1.aws.neon.tech:5432"), { digest: "123" });

async function render(file: string) {
  const path = join(__dirname, file);
  expect(existsSync(path), `${file} exists`).toBe(true);
  const { default: Boundary } = await import(/* @vite-ignore */ path);
  return renderToStaticMarkup(<Boundary error={raw} retry={() => {}} reset={() => {}} />);
}

describe.each(["(app)/error.tsx", "global-error.tsx"])("the error boundary %s", (file) => {
  it("says in plain words that the page could not be loaded and offers Try again", async () => {
    const html = await render(file);
    expect(html).toContain("could not be loaded");
    expect(html).toMatch(/<button[^>]*>Try again<\/button>/);
  });

  it("never shows the error's own text, which can name the database host", async () => {
    expect(await render(file)).not.toContain("neon.tech");
  });
});

describe("the root error boundary", () => {
  it("renders its own document, as it replaces the root layout", async () => {
    const html = await render("global-error.tsx");
    expect(html).toMatch(/^<html[^>]*><body/);
  });
});

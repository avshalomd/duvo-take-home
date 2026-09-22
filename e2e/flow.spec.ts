import { expect, test, type Page } from "@playwright/test";

// Runs against a dev server on whatever runs the database holds:
// BASE_URL=http://localhost:3001 npx playwright test e2e/flow.spec.ts
// It never starts a run, so it creates nothing and cleans nothing up.
async function openFirstRun(page: Page) {
  await page.goto("/");
  await page.getByTestId("runs").getByRole("link").first().click();
  await expect(page.getByTestId("run-panel")).toBeVisible();
  return page.getByTestId("run-panel");
}

// A run still working has no plan and no verdict yet, so anything about the finished picture opens a finished run.
async function openFinishedRun(page: Page) {
  await page.goto("/");
  await page.getByTestId("runs").getByRole("link").filter({ hasText: /Done/ }).first().click();
  await expect(page.getByTestId("run-panel")).toBeVisible();
  return page.getByTestId("run-panel");
}

test("the home page offers the instructions box, the connections with switches and the past runs", async ({ page }) => {
  await page.goto("/");

  const box = page.getByRole("textbox", { name: /instructions/i });
  await expect(box).toBeVisible();
  await expect(box).toHaveAttribute("placeholder", /latest AI news/i);
  await expect(page.getByRole("button", { name: "Run", exact: true })).toBeVisible(); // exact: "Run again" lives in the panel

  const connections = page.getByTestId("connections");
  await expect(connections.getByRole("switch").first()).toBeVisible();

  await expect(page.getByTestId("runs").getByRole("link").first()).toBeVisible();
});

test("the header names the product and says what it does", async ({ page }) => {
  await page.goto("/");
  const header = page.getByTestId("app-header");
  await expect(header.getByRole("heading", { name: "Automations" })).toBeVisible();
  await expect(header).toContainText(/agent/i); // the tagline: one line on what the app is for
});

test("the instructions box says how to run from the keyboard, and the shortcut submits", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/enter to run/i)).toBeVisible();

  // a too-short prompt: the shortcut is proven by the validation error coming back, and no run is started
  await page.getByRole("textbox", { name: /instructions/i }).fill("do it");
  await page.getByRole("textbox", { name: /instructions/i }).press("ControlOrMeta+Enter");
  await expect(page.getByText(/say what the agent should do/i)).toBeVisible();
});

test("a connection that was never reached reads 'needs a token', not 'not_configured'", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("connections")).not.toContainText("not_configured");
  await expect(page.getByTestId("connections")).toContainText(/needs a token|never used|connected/);
});

test("each run in the list carries its status and how long ago it ran", async ({ page }) => {
  await page.goto("/");
  const first = page.getByTestId("runs").getByRole("link").first();
  await expect(first).toContainText(/ago|just now/);
  // the row says exactly what the panel says, verdict included: never a bare "Done" on a run that did not pass
  await expect(first).toContainText(/Done - looks good|Done, with notes|Done, but the result did not pass|Done - not checked|Done|Working on it|Getting ready|Checking the result|Something went wrong/);
  await first.click();
  await expect(first).toHaveAttribute("aria-current", "true"); // the open run stays marked in the list

  // the list and the panel must not disagree about how a run turned out
  const rowWords = await first.getByTestId("row-outcome").textContent();
  await expect(page.getByTestId("run-panel").getByTestId("outcome")).toHaveText(rowWords!);
});

test("a run is named by its instructions and says how it turned out in plain words", async ({ page }) => {
  const panel = await openFirstRun(page);
  await expect(panel.getByTestId("outcome")).toHaveText(/Done|Working on it|Getting ready|Checking|Something went wrong/);
  await expect(panel.getByRole("heading", { level: 2 })).not.toHaveText(/^[0-9a-f]{8}-/); // the title is the task, not the id
  await expect(panel.getByTestId("files")).toBeVisible();
});

test("the plan leads the panel as a stepper with a progress line saying how many steps are settled", async ({ page }) => {
  const panel = await openFinishedRun(page);
  await expect(panel.getByTestId("plan-progress")).toContainText(/\d+ of \d+ steps/);
  await expect(panel.getByTestId("plan-steps").getByRole("listitem").first()).toBeVisible();
});

test("what the run produced is offered as files to download and a readable report", async ({ page }) => {
  const panel = await openFirstRun(page);
  const produced = panel.getByTestId("produced");
  await expect(produced).toBeVisible();
  // a run with files offers each one with a Download button; a run without says so in words
  const files = produced.getByTestId("files");
  await expect(files).toContainText(/Download|No files/i);
  // the report is prose, not raw markdown: no ** left on the screen
  await expect(produced).not.toContainText("**");
});

test("the outcome is said in plain words with the checks as a short list", async ({ page }) => {
  const panel = await openFirstRun(page);
  const result = panel.getByTestId("result");
  await expect(result).toContainText(/Done|Working on it|Getting ready|Checking|Something went wrong/);
  await expect(result).not.toContainText(/%|followedPlan|answeredQuery/); // probabilities belong under Details
});

test("everything technical is folded behind Details until it is asked for", async ({ page }) => {
  const panel = await openFirstRun(page);
  await expect(panel.getByTestId("timeline")).toBeHidden();

  await panel.getByRole("button", { name: /details/i }).click();
  await expect(panel.getByTestId("timeline")).toBeVisible();
  await expect(panel.getByTestId("state-card")).toContainText(/turn \d+ of \d+/);
  await expect(panel.getByTestId("verdict")).toBeVisible();
});

// test.describe with its own viewport: setViewportSize inside the test raced the page's first paint in a full run
test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the page fits the screen and leads with the run", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("run-panel")).toBeVisible(); // the page streams a skeleton first: measure the real thing

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth); // nothing sticks out sideways: no horizontal scrolling

    // one column, and the open run is above the form: after pressing Run, the run is what you want to see
    const panel = await page.getByTestId("run-panel").boundingBox();
    const form = await page.getByRole("textbox", { name: /instructions/i }).boundingBox();
    expect(panel!.y).toBeLessThan(form!.y);
  });

  // Q38: the panel header must not cover what is under it - the point over the failure text is the failure text
  test("nothing floats over the panel's own content", async ({ page }) => {
    await page.goto("/");
    // "What it produced" is in every panel whatever the run did, so this does not depend on which run is newest
    // the section's heading, not the section: a tall section can start above the viewport, where elementFromPoint is null
    const heading = page.getByTestId("produced").getByRole("heading", { name: /what it produced/i });
    await expect(heading).toBeVisible();
    await heading.scrollIntoViewIfNeeded();
    const box = await heading.boundingBox();
    const onTop = await page.evaluate(
      (p) => document.elementFromPoint(p.x, p.y)?.closest("[data-testid]")?.getAttribute("data-testid") ?? "",
      { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
    );
    expect(onTop).toBe("produced");
  });
});

// Only the validation path is exercised here: a valid submit would start a real agent run on the shared database.
test("instructions that say nothing are refused before any run is started", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: /instructions/i }).fill("do it");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByText(/say what the agent should do/i)).toBeVisible();
});

test("a new MCP server is added in a dialog and refused with a readable error when the URL is not a URL", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /add a server/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Name").fill("Linear");
  await dialog.getByLabel("URL").fill("not-a-url");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  // a full sentence with an example, and the cursor put back in the field that was refused
  await expect(page.getByTestId("connections-form")).toContainText(/full address, starting with https/i);
  await expect(dialog.getByLabel("URL")).toBeFocused();
});

// ---- round 3 QA findings: the keyboard, the screen reader and the phone (Q62, Q68-Q76) ----

// Q62: a modal that does not hold the keyboard loses the person who cannot see where focus went.
test("the add-a-server dialog holds the keyboard inside it and hands it back on Escape", async ({ page }) => {
  await page.goto("/");
  const opener = page.getByRole("button", { name: /add a server/i });
  await opener.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");

  // more tabs than the dialog has controls: focus must cycle inside it, never reach the page behind
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused(); // the cursor comes back to where it was
});

// Q68: the outcome changes while the run polls; a live region is the only way that reaches a screen reader.
test("the run's outcome line is a live region", async ({ page }) => {
  const panel = await openFirstRun(page);
  const status = panel.getByRole("status").first();
  await expect(status).toContainText(/Done|Working on it|Getting ready|Checking|Something went wrong/);
  await expect(status.getByTestId("outcome")).toBeVisible();
});

// Q70: 22 tabs through the runs list before reaching the run is not a keyboard path anyone would take.
test("the first tab on the page skips to the open run", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("run-panel")).toBeVisible();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: /skip to the run/i });
  await expect(skip).toBeFocused();
  await skip.press("Enter");
  await expect(page.getByTestId("run-panel")).toBeFocused();
});

// Q71: one focus ring, so a keyboard user sees the same mark wherever they are.
test("run rows and the Details toggle carry the same focus-ring token", async ({ page }) => {
  const panel = await openFirstRun(page);
  const row = page.getByTestId("runs").getByRole("link").first();
  const details = panel.getByRole("button", { name: /details/i });
  for (const el of [row, details]) {
    await expect(el).toHaveClass(/focus-visible:ring-\[3px\]/);
  }
});

// Q72: two links both called "Download" are two identical rows in a screen reader's link list.
test("each download link names its file and its size", async ({ page }) => {
  await page.goto("/");
  const rows = page.getByTestId("runs").getByRole("link");
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    await rows.nth(i).click();
    await expect(page.getByTestId("files")).toBeVisible();
    const link = page.getByTestId("files").getByRole("link").first();
    if ((await link.count()) === 0) continue;
    await expect(link).toHaveAccessibleName(/^Download .+ \(\d+(\.\d+)? KB\)$/);
    return;
  }
  throw new Error("no run with a file in this database - seed one");
});

// Q73: headings and landmarks are how a screen reader user moves; a label is not a heading.
test("the page is navigable by landmark and heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2, name: /instructions/i })).toBeVisible();
  await expect(page.getByRole("navigation", { name: /past runs/i })).toBeVisible();
  const panel = page.getByTestId("run-panel");
  await expect(panel).toHaveAttribute("aria-labelledby", "run-title");
  await expect(page.locator("#run-title")).toBeVisible();
});

// Q74: a truncated instruction with no tooltip, and a bare "19 s - $0.028", say nothing.
test("a run row shows its full instructions on hover and says what its numbers mean", async ({ page }) => {
  await page.goto("/");
  const rows = page.getByTestId("runs").getByRole("link");
  await expect(rows.first()).toHaveAttribute("title", /\S/);
  const finished = rows.filter({ hasText: /Done/ }).first();
  await expect(finished).toContainText(/\d+ s, \$\d+(\.\d+)? spent/);
});

test.describe("on a phone, the controls are reachable", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // Q75: 28 px is a miss under a thumb; 40 px is the smallest target that is not a game.
  test("the primary controls are at least 40 px tall", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("run-panel")).toBeVisible();
    const run = await page.getByRole("button", { name: "Run", exact: true }).boundingBox();
    expect(run!.height).toBeGreaterThanOrEqual(40);

    // the switch stays small, but its hit area does not: a press 14 px above its middle still lands on it
    const box = (await page.getByTestId("connections").getByRole("switch").first().boundingBox())!;
    const role = await page.evaluate(
      (p) => document.elementFromPoint(p.x, p.y)?.closest("[role=switch]")?.getAttribute("role") ?? "",
      { x: box.x + box.width / 2, y: box.y + box.height / 2 - 14 },
    );
    expect(role).toBe("switch");
  });

  // Q76: with a run open, the instructions box is a thousand pixels down the page.
  test("the header offers a way back to a new run", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("run-panel")).toBeVisible();
    await page.getByTestId("app-header").getByRole("link", { name: /new run/i }).click();
    await expect(page.getByRole("textbox", { name: /instructions/i })).toBeInViewport();
  });
});

// Q69: a switch that disables itself under the finger drops focus and swallows the second press.
test("a connection switch keeps focus while its change is saved", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByTestId("connections").getByRole("switch").first();
  const before = await toggle.getAttribute("aria-checked");
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toBeEnabled(); // never disabled mid-flight
  await expect(toggle).toBeFocused();
  await expect(toggle).not.toHaveAttribute("aria-checked", before!);

  await page.keyboard.press("Space"); // put the connection back as it was
  await expect(toggle).toHaveAttribute("aria-checked", before!);
});

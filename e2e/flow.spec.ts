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
  await first.click();
  await expect(first).toHaveAttribute("aria-current", "true"); // the open run stays marked in the list
});

test("a run is named by its instructions and says how it turned out in plain words", async ({ page }) => {
  const panel = await openFirstRun(page);
  await expect(panel.getByTestId("outcome")).toHaveText(/Done|Working on it|Getting ready|Checking|Something went wrong/);
  await expect(panel.getByRole("heading", { level: 2 })).not.toHaveText(/^[0-9a-f]{8}-/); // the title is the task, not the id
  await expect(panel.getByTestId("files")).toBeVisible();
});

test("the plan leads the panel as a stepper with a progress line saying how many steps are settled", async ({ page }) => {
  const panel = await openFirstRun(page);
  await expect(panel.getByTestId("plan-progress")).toContainText(/\d+ of \d+ steps/);
  await expect(panel.getByTestId("plan-steps").getByRole("listitem").first()).toBeVisible();
});

test("everything technical is folded behind Details until it is asked for", async ({ page }) => {
  const panel = await openFirstRun(page);
  await expect(panel.getByTestId("timeline")).toBeHidden();

  await panel.getByRole("button", { name: /details/i }).click();
  await expect(panel.getByTestId("timeline")).toBeVisible();
  await expect(panel.getByTestId("state-card")).toContainText(/turn \d+ of \d+/);
  await expect(panel.getByTestId("verdict")).toBeVisible();
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
  await expect(page.getByTestId("connections-form")).toContainText(/full http/i);
});

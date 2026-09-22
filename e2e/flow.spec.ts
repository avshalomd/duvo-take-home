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

test("opening a run shows intent, plan, state, timeline, files and verdict in that order", async ({ page }) => {
  const panel = await openFirstRun(page);

  const sections = panel.getByRole("heading", { level: 3 });
  await expect(sections).toHaveText([/intent/i, /plan/i, /state/i, /timeline/i, /files/i, /verdict/i]);

  // the state card carries the numbers the run is judged on
  await expect(panel.getByTestId("state-card")).toContainText(/turn \d+ of \d+/);
  await expect(panel.getByTestId("state-card")).toContainText(/\$\d|-/);

  // the timeline is the agent's own trace, grouped under the plan step each event belonged to
  await expect(panel.getByTestId("timeline")).toBeVisible();

  await expect(panel.getByTestId("files")).toBeVisible();
  await expect(panel.getByTestId("verdict")).toBeVisible();
  await expect(panel.getByRole("button", { name: /run again/i })).toBeVisible();
});

// Only the validation path is exercised here: a valid submit would start a real agent run on the shared database.
test("instructions that say nothing are refused before any run is started", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: /instructions/i }).fill("do it");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByText(/say what the agent should do/i)).toBeVisible();
});

test("a new MCP server is refused with a readable error when the URL is not a URL", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /add an MCP server/i }).click();
  await page.getByLabel("Name").fill("Linear");
  await page.getByLabel("URL").fill("not-a-url");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByTestId("connections-form")).toContainText(/full http/i);
});

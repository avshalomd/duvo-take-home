import { expect, test } from "@playwright/test";

// Runs against the worktree's dev server on the fixture-backed stubs:
// BASE_URL=http://localhost:3001 npx playwright test e2e/flow.spec.ts
// Runs are found through the page's own list: the database gives them ids, so a fixture id would not resolve.
async function openRun(page: import("@playwright/test").Page, match: RegExp) {
  await page.goto("/");
  const link = page.locator('a[href^="/?run="]').filter({ hasText: match }).first();
  const href = await link.getAttribute("href");
  if (!href) throw new Error(`no run in the list matches ${match}`);
  await page.goto(href);
  return href.replace("/?run=", "");
}

test("the home page offers the instructions box, the connections with switches and the past runs", async ({ page }) => {
  await page.goto("/");

  const box = page.getByRole("textbox", { name: /instructions/i });
  await expect(box).toBeVisible();
  await expect(box).toHaveAttribute("placeholder", /latest AI news/i);
  await expect(page.getByRole("button", { name: "Run", exact: true })).toBeVisible(); // exact: "Run again" lives in the panel

  const connections = page.getByTestId("connections");
  await expect(connections.getByText("DeepWiki", { exact: true })).toBeVisible();
  await expect(connections.getByRole("switch").first()).toBeVisible();

  const runs = page.getByTestId("runs");
  expect(await runs.getByRole("link").count()).toBeGreaterThanOrEqual(5); // the seeded runs plus whatever was run since
  await expect(runs.getByText("running")).toBeVisible();
});

test("opening a run shows intent, plan, state, timeline, files and verdict in that order", async ({ page }) => {
  const id = await openRun(page, /AI news/);

  const panel = page.getByTestId("run-panel");
  await expect(panel).toBeVisible();

  const sections = panel.getByRole("heading", { level: 3 });
  await expect(sections).toHaveText([/intent/i, /plan/i, /state/i, /timeline/i, /files/i, /verdict/i]);

  // the state card carries the numbers the run is judged on
  await expect(panel.getByTestId("state-card")).toContainText("succeeded");
  await expect(panel.getByTestId("state-card")).toContainText("$");

  // the timeline is the agent's own trace: text, tool calls and their results
  await expect(panel.getByTestId("timeline").getByText(/WebSearch/).first()).toBeVisible();

  // the file it wrote is downloadable from the run
  const download = panel.getByTestId("files").getByRole("link", { name: /output\.csv/ });
  await expect(download).toHaveAttribute("href", `/api/runs/${id}/files/output.csv`);

  // the evaluator ran as the run's last step: its verdict is on the run
  await expect(panel.getByTestId("verdict")).toContainText(/pass|fail/i);
});

test("a failed run shows why it stopped and offers Run again", async ({ page }) => {
  await openRun(page, /failed/);

  const panel = page.getByTestId("run-panel");
  await expect(panel.getByTestId("state-card")).toContainText("failed");
  await expect(panel.getByTestId("files")).toContainText(/no files/i);
  await expect(panel.getByRole("button", { name: /run again/i })).toBeVisible();
});

// Only the validation path is exercised here: a valid submit would start a real agent run on the shared database.
test("instructions that say nothing are refused before any run is started", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: /instructions/i }).fill("do it");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByText(/say what the agent should do/i)).toBeVisible();
});

test("re-evaluating a finished run leaves a verdict on the page", async ({ page }) => {
  await openRun(page, /AI news/);
  await page.getByRole("button", { name: /re-evaluate/i }).click();
  await expect(page.getByTestId("verdict")).toContainText(/pass|fail|unknown/i, { timeout: 60_000 });
});

test("a new MCP server is refused with a readable error when the URL is not a URL", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /add an MCP server/i }).click();
  await page.getByLabel("Name").fill("Linear");
  await page.getByLabel("URL").fill("not-a-url");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByTestId("connections-form")).toContainText(/full http/i);
});

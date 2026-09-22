import { expect, test } from "@playwright/test";

// Runs against the worktree's dev server on the fixture-backed stubs:
// BASE_URL=http://localhost:3001 npx playwright test e2e/flow.spec.ts
const FIXTURE_RUN = "run_01JQ8N4K2W"; // the AI-news run: files and a verdict
const FAILED_RUN = "run_01JQ8R2F0C"; // the max-turns run: an error state, no files

test("the home page offers the instructions box, the connections with switches and the past runs", async ({ page }) => {
  await page.goto("/");

  const box = page.getByRole("textbox", { name: /instructions/i });
  await expect(box).toBeVisible();
  await expect(box).toHaveAttribute("placeholder", /latest AI news/i);
  await expect(page.getByRole("button", { name: "Run" })).toBeVisible();

  const connections = page.getByTestId("connections");
  await expect(connections.getByText("DeepWiki")).toBeVisible();
  await expect(connections.getByRole("switch").first()).toBeVisible();

  const runs = page.getByTestId("runs");
  await expect(runs.getByRole("link")).toHaveCount(5);
  await expect(runs.getByText("running")).toBeVisible();
});

test("opening a run shows intent, plan, state, timeline, files and verdict in that order", async ({ page }) => {
  await page.goto(`/?run=${FIXTURE_RUN}`);

  const panel = page.getByTestId("run-panel");
  await expect(panel).toBeVisible();

  const sections = panel.getByRole("heading", { level: 3 });
  await expect(sections).toHaveText([/intent/i, /plan/i, /state/i, /timeline/i, /files/i, /verdict/i]);

  // the state card carries the numbers the run is judged on
  await expect(panel.getByTestId("state-card")).toContainText("succeeded");
  await expect(panel.getByTestId("state-card")).toContainText("$0.164");

  // the timeline is the agent's own trace: text, tool calls and their results
  await expect(panel.getByTestId("timeline").getByText('WebSearch "AI news September 2026"')).toBeVisible();

  // the file it wrote is downloadable from the run
  const download = panel.getByTestId("files").getByRole("link", { name: /output\.csv/ });
  await expect(download).toHaveAttribute("href", `/api/runs/${FIXTURE_RUN}/files/output.csv`);

  await expect(panel.getByTestId("verdict")).toContainText("pass");
  await expect(panel.getByTestId("verdict")).toContainText("CSV parses");
});

test("a failed run shows why it stopped and offers Run again", async ({ page }) => {
  await page.goto(`/?run=${FAILED_RUN}`);

  const panel = page.getByTestId("run-panel");
  await expect(panel.getByTestId("state-card")).toContainText("failed");
  await expect(panel.getByTestId("files")).toContainText(/no files/i);
  await expect(panel.getByRole("button", { name: /run again/i })).toBeVisible();
});

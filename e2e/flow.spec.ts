import { expect, test, type Page } from "@playwright/test";
import { createHomeRuns, deleteHomeRuns, TITLES, type HomeRuns } from "./home-fixture";

// The Home page: the runs rail, the composer on top of the run, the run's glance view and its Details drawer.
// Runs against a dev server on the local database:
//   BASE_URL=http://localhost:3001 npx playwright test e2e/flow.spec.ts
// It inserts four "[e2e] home" runs in known shapes and deletes them afterwards. It never starts an agent run:
// every submit it makes is one the server refuses before a run exists.

let runs: HomeRuns;
test.beforeAll(async () => {
  runs = await createHomeRuns();
});
test.afterAll(async () => {
  await deleteHomeRuns();
});

async function openRun(page: Page, id: string) {
  await page.goto(`/?run=${id}`);
  const panel = page.getByTestId("run-panel");
  await expect(panel).toBeVisible();
  return panel;
}

const composer = (page: Page) => page.getByRole("textbox", { name: /what should the agent do/i });

test.describe("the layout", () => {
  test("the top bar offers the three pages and marks Home as the one open", async ({ page }) => {
    await page.goto("/");
    const pages = page.getByTestId("app-header").getByRole("navigation", { name: "Pages" });
    for (const name of ["Home", "Automations", "Settings"]) await expect(pages.getByRole("link", { name })).toBeVisible();
    await expect(pages.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  });

  test("the rail lists the runs grouped by day, and the composer sits on top of the run", async ({ page }) => {
    await openRun(page, runs.followUp);
    const rail = page.getByRole("navigation", { name: "Runs" });
    await expect(rail.getByRole("heading", { name: "Today" })).toBeVisible(); // the fixture's runs are minutes old
    await expect(rail.locator(`a[href="/?run=${runs.followUp}"]`)).toContainText(TITLES.followUp);

    const box = (await composer(page).boundingBox())!;
    const panel = (await page.getByTestId("run-panel").boundingBox())!;
    expect(box.y).toBeLessThan(panel.y);
  });

  test("the search box filters the rail by the instructions", async ({ page }) => {
    await page.goto("/");
    const rail = page.getByRole("navigation", { name: "Runs" });
    await rail.getByRole("searchbox", { name: /search runs/i }).fill("e2e home follow-up");
    await expect(rail.getByRole("link")).toHaveCount(1);
    await expect(rail.getByRole("link")).toContainText("follow-up"); // the quiet tag of a follow-up

    await rail.getByRole("searchbox", { name: /search runs/i }).fill("zzzz no run says this");
    await expect(rail.getByRole("link")).toHaveCount(0);
    await expect(rail).toContainText(/no runs match/i);
  });

  test("a run opened from the rail is marked there, and the rail and the run say the same outcome", async ({ page }) => {
    await page.goto("/");
    const row = page.getByRole("navigation", { name: "Runs" }).locator(`a[href="/?run=${runs.stopped}"]`);
    await row.click();
    await expect(row).toHaveAttribute("aria-current", "true");
    await expect(row).toContainText("Stopped by you"); // the words are there for a screen reader beside the dot
    await expect(page.getByTestId("run-panel").getByTestId("outcome")).toHaveText("Stopped by you");
    await expect(page.locator("#run-title")).toHaveText(TITLES.stopped); // the run is named by its instructions
  });
});

test.describe("the composer", () => {
  test("typing / lists the saved automations, and says how to make one when there are none", async ({ page }) => {
    await page.goto("/");
    await composer(page).fill("/");
    const list = page.getByRole("listbox", { name: /saved automations/i });
    await expect(list).toBeVisible();
    await expect(list).toContainText(/no saved automations yet - make one from a finished run|\/[a-z]/i);
    await composer(page).press("Escape");
    await expect(list).toBeHidden();
  });

  // his call, 2026-09-23: commands are "/audit ..."; a backslash is plain text and opens nothing
  test("a backslash does not open the list", async ({ page }) => {
    await page.goto("/");
    await composer(page).fill("\\");
    await expect(page.getByRole("listbox", { name: /saved automations/i })).toHaveCount(0);
  });

  test("instructions that say nothing are refused before any run is started", async ({ page }) => {
    await page.goto("/");
    await composer(page).fill("do it");
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByText(/say what the agent should do/i)).toBeVisible();
    await expect(composer(page)).toHaveValue("do it"); // what was typed is kept
  });

  test("Ctrl/Cmd+Enter submits the box", async ({ page }) => {
    await page.goto("/");
    await composer(page).fill("do it");
    await composer(page).press("ControlOrMeta+Enter");
    await expect(page.getByText(/say what the agent should do/i)).toBeVisible();
  });

  test("a command that is not a saved automation is refused, naming it", async ({ page }) => {
    await page.goto("/");
    await composer(page).fill("/nope-e2e Acme Ltd");
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "/nope-e2e" })).toBeVisible();
  });

  test("the connections that are on are named under the box, with a way to Settings", async ({ page }) => {
    await page.goto("/");
    const chips = page.getByTestId("composer-connections");
    await expect(chips).toContainText(/Using:|No connections on/);
    await expect(chips.getByRole("link").first()).toHaveAttribute("href", "/settings/connections");
  });
});

test.describe("a finished run", () => {
  test("Why? explains the outcome in plain words, one line per tier, without probabilities", async ({ page }) => {
    const panel = await openRun(page, runs.followUp);
    await expect(panel.getByTestId("outcome")).toHaveText("Done, with notes");
    const why = panel.getByRole("button", { name: /why\?/i });
    await expect(why).toHaveAttribute("aria-expanded", "false");
    await why.click();
    const lines = panel.getByTestId("why");
    await expect(lines).toContainText("4 checks passed");
    await expect(lines).toContainText("The judge was sure the result answers your instructions but not that the plan was finished");
    await expect(lines).toContainText("A reviewer read the whole run: finished and usable.");
    await expect(lines).not.toContainText("%");
  });

  test("Why? works on a verdict recorded before v2", async ({ page }) => {
    const panel = await openRun(page, runs.parent);
    await panel.getByRole("button", { name: /why\?/i }).click();
    await expect(panel.getByTestId("why")).toContainText("4 checks passed");
    await expect(panel.getByTestId("why")).toContainText("The judge was sure the result answers your instructions and that the plan was finished");
  });

  test("a follow-up names the run it follows and links to it; the person's own mark is shown", async ({ page }) => {
    const panel = await openRun(page, runs.followUp);
    const link = panel.getByRole("link", { name: /follows up/i });
    await expect(link).toContainText(TITLES.parent);
    await expect(link).toHaveAttribute("href", `/?run=${runs.parent}`);
    await expect(panel).toContainText("You marked this: looks right");
  });

  test("a step the checker doubted is flagged on the stepper, and a stopped guard is said in plain words", async ({ page }) => {
    const panel = await openRun(page, runs.followUp);
    const flagged = panel.getByTestId("plan-steps").getByRole("listitem").nth(1);
    await expect(flagged).toContainText("It found two facts, not three.");
    await expect(flagged.getByTestId("step-flag")).toBeVisible();
    await expect(panel.getByTestId("plan-steps").getByTestId("step-flag")).toHaveCount(1); // the on-track step is not flagged

    await expect(panel.getByTestId("guard-notices")).toContainText("A web page tried to make the agent send your data elsewhere. It was stopped.");
    await expect(panel.getByTestId("guard-notices")).not.toContainText("query string"); // the raw reason is for Details
  });

  test("files: a chart is previewed, a spreadsheet is a card, flags are one line, a held-back file asks first", async ({ page }) => {
    const panel = await openRun(page, runs.followUp);
    const files = panel.getByTestId("files");
    await expect(files.getByRole("img", { name: /chart\.svg/ })).toHaveAttribute("src", `/api/runs/${runs.followUp}/files/chart.svg?inline=1`);
    await expect(files).toContainText("Spreadsheet");
    await expect(files).toContainText("Contains 3 email addresses");
    await expect(files.getByRole("link", { name: /download anyway/i })).toHaveAttribute("href", `/api/runs/${runs.followUp}/files/keys.txt?confirm=1`);
    await expect(files.getByRole("link", { name: /^Download contacts\.csv \(\d+(\.\d+)? KB\)$/ })).toBeVisible(); // Q72: each link names its file
  });

  test("a finished run offers Make an automation and Ask for a change, and a change that says nothing is refused", async ({ page }) => {
    const panel = await openRun(page, runs.followUp);
    await expect(panel.getByRole("link", { name: /make an automation/i })).toHaveAttribute("href", `/automations/new?run=${runs.followUp}`);
    const change = panel.getByRole("textbox", { name: /ask for a change/i });
    await change.fill("ab");
    await panel.getByRole("button", { name: /send the change/i }).click();
    await expect(panel.getByText(/say what should change/i)).toBeVisible();
  });

  test("Details opens as a drawer with the timeline, the state and the raw verdict, and closes on Escape", async ({ page }) => {
    // React warns in the console when two list items share a key: two "content" checks once did (one per file)
    const keyWarnings: string[] = [];
    page.on("console", (m) => {
      if (/same key/i.test(m.text())) keyWarnings.push(m.text());
    });
    const panel = await openRun(page, runs.followUp);
    await expect(page.getByTestId("timeline")).toBeHidden();
    const opener = panel.getByRole("button", { name: /details/i });
    await opener.click();
    const drawer = page.getByRole("dialog", { name: /details/i });
    await expect(drawer.getByTestId("timeline")).toBeVisible();
    await expect(drawer.getByTestId("state-card")).toContainText(/turn \d+ of \d+/);
    await expect(drawer.getByTestId("verdict")).toContainText("%"); // the probabilities live here
    await expect(drawer).toContainText(runs.followUp); // the id, for a bug report
    await expect(drawer).toContainText(/blocked/i); // the guard's raw decision
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(opener).toBeFocused();
    expect(keyWarnings).toEqual([]);
  });

  test("a stopped run reads 'Stopped by you' and shows where the plan stopped", async ({ page }) => {
    const panel = await openRun(page, runs.stopped);
    await expect(panel.getByTestId("outcome")).toHaveText("Stopped by you");
    await expect(panel.getByTestId("plan-steps")).toContainText(/stopped here/i);
    await expect(panel.getByRole("button", { name: /^stop$/i })).toHaveCount(0);
  });
});

test.describe("a live run", () => {
  test("offers Stop, and pressing it either stops the run or says why it cannot", async ({ page }) => {
    const panel = await openRun(page, runs.live);
    await expect(panel.getByTestId("outcome")).toHaveText(/Working on it/);
    await expect(panel).not.toContainText(/Stopping|Stopped by you|not available yet/);
    await panel.getByRole("button", { name: /^stop$/i }).click();
    // with the engine in place the run says it is stopping; before, the panel says Stop is not available yet
    await expect(panel).toContainText(/Stopping|Stopped by you|not available yet/);
  });
});

test.describe("keyboard", () => {
  // Q70: the first tab on Home jumps past the bar and the rail to the run.
  test("the first tab on the page skips to the open run", async ({ page }) => {
    await openRun(page, runs.followUp);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: /skip to the run/i });
    await expect(skip).toBeFocused();
    await skip.press("Enter");
    await expect(page.getByTestId("run-panel")).toBeFocused();
  });

  // Q71: one focus ring everywhere.
  test("rail rows and the Details button carry the same focus-ring token", async ({ page }) => {
    const panel = await openRun(page, runs.followUp);
    const row = page.getByRole("navigation", { name: "Runs" }).getByRole("link").first();
    for (const el of [row, panel.getByRole("button", { name: /details/i })]) await expect(el).toHaveClass(/focus-visible:ring-\[3px\]/);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the rail is a sheet opened from the top bar; the composer stays on top and the run below it", async ({ page }) => {
    await openRun(page, runs.followUp);
    await expect(page.getByRole("navigation", { name: "Runs" })).toBeHidden();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth); // nothing sticks out sideways

    const box = (await composer(page).boundingBox())!;
    const panel = (await page.getByTestId("run-panel").boundingBox())!;
    expect(box.y).toBeLessThan(panel.y);

    await page.getByTestId("app-header").getByRole("button", { name: /runs/i }).click();
    const sheet = page.getByRole("dialog", { name: /runs/i });
    await expect(sheet.getByRole("navigation", { name: "Runs" })).toBeVisible();
    await sheet.locator(`a[href="/?run=${runs.parent}"]`).click();
    await expect(sheet).toBeHidden(); // picking a run closes the sheet
    await expect(page.locator("#run-title")).toHaveText(TITLES.parent);
  });

  test("the Run button is big enough for a thumb", async ({ page }) => {
    await page.goto("/");
    const run = (await page.getByRole("button", { name: "Run", exact: true }).boundingBox())!;
    expect(run.height).toBeGreaterThanOrEqual(40); // Q75
  });
});

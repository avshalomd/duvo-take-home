import { expect, test, type Page } from "@playwright/test";
import { AUTOMATION, createHomeRuns, deleteHomeRuns, READY, TITLES, type HomeRuns } from "./home-fixture";

// The Home page: the rail, the first-visit question, the run sheet with its thread, the floating composer and the
// Details panel. Runs against a dev server on the local database, signed in as the demo user:
//   BASE_URL=http://localhost:3001 npx playwright test e2e/flow.spec.ts
// It inserts "[e2e] home" runs and automations in known shapes and deletes them afterwards. It never starts an agent
// run: every submit it makes is one the server refuses before a run exists.

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
const rail = (page: Page) => page.getByRole("navigation", { name: "Runs" });

test.describe("the frame", () => {
  test("the top bar offers the three pages, marks Home as open, and carries a product mark that is not a second link called Automations", async ({ page }) => {
    await page.goto("/");
    const header = page.getByTestId("app-header");
    const pages = header.getByRole("navigation", { name: "Pages" });
    for (const name of ["Home", "Automations", "Settings"]) await expect(pages.getByRole("link", { name })).toBeVisible();
    await expect(pages.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    // Q113: the mark is a glyph with the product's name as its label, not the word beside the Automations page
    const mark = header.getByRole("link", { name: "Automations home" });
    await expect(mark).toBeVisible();
    await expect(mark).toHaveText("");
  });

  test("with no run open, Home asks one question, with the composer under it", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "What should the agent do?" })).toBeVisible();
    await expect(composer(page)).toBeFocused();
    await expect(page.getByTestId("run-panel")).toHaveCount(0);
  });

  test("the saved automations under the question are tokens that fill the box", async ({ page }) => {
    await page.goto("/");
    const token = page.getByTestId("automation-tokens").getByRole("button", { name: `\\${READY.command}` });
    await token.click();
    await expect(composer(page)).toHaveValue(`\\${READY.command} `);
  });

  test("the rail groups the runs by day and the open run is a sheet with the composer floating at its bottom", async ({ page }) => {
    await openRun(page, runs.followUp);
    await expect(rail(page).getByRole("heading", { name: "Today" })).toBeVisible(); // the fixture's runs are minutes old
    await expect(rail(page).locator(`a[href="/?run=${runs.followUp}"]`)).toContainText(TITLES.followUp);

    const title = (await page.locator("#run-title").boundingBox())!;
    const box = (await composer(page).boundingBox())!;
    expect(box.y).toBeGreaterThan(title.y);
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height); // floating in view, not at the end of the page
  });

  test("the search box filters the rail by the instructions, and by an automation's command and name", async ({ page }) => {
    await page.goto("/");
    const search = rail(page).getByRole("searchbox", { name: /search runs/i });
    await search.fill("e2e home follow-up");
    await expect(rail(page).getByRole("link")).toHaveCount(1);
    await expect(rail(page).getByRole("link")).toContainText("follow-up");

    await search.fill(`\\${AUTOMATION.command}`); // Q133
    await expect(rail(page).locator(`a[href="/?run=${runs.audit}"]`)).toBeVisible();

    await search.fill("zzzz no run says this");
    await expect(rail(page).getByRole("link")).toHaveCount(0);
    await expect(rail(page)).toContainText(/no runs match/i);
  });

  test("a rail row says its outcome in words, and says the same thing as the run", async ({ page }) => {
    await page.goto("/");
    const row = rail(page).locator(`a[href="/?run=${runs.stopped}"]`);
    await expect(row).toContainText("Stopped"); // Q105: words beside the dot, shown on hover and read out
    await row.click();
    await expect(row).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("run-panel").getByTestId("outcome")).toHaveText("Stopped");
    await expect(page.locator("#run-title")).toHaveText(TITLES.stopped); // the brief is the title
  });

  test("a run of a saved automation is named by the automation and its input", async ({ page }) => {
    await openRun(page, runs.audit);
    await expect(page.locator("#run-title")).toHaveText(`${AUTOMATION.name}: ${AUTOMATION.input}`); // Q94
    await expect(rail(page).locator(`a[href="/?run=${runs.audit}"]`)).toContainText(`${AUTOMATION.name}: ${AUTOMATION.input}`);
  });
});

test.describe("the composer", () => {
  test("typing \\ lists the ready automations by command and name, and picking one shows what to type next", async ({ page }) => {
    await page.goto("/");
    await composer(page).fill("\\e2e-home-re");
    const list = page.getByRole("listbox", { name: /saved automations/i });
    await expect(list.getByRole("option").first()).toContainText(`\\${READY.command}`);
    await expect(list.getByRole("option").first()).toContainText(READY.name);
    await composer(page).press("Enter");
    await expect(composer(page)).toHaveValue(`\\${READY.command} `);
    await expect(page.getByTestId("command-hint")).toHaveText(READY.hint); // Q93
    await composer(page).press("Escape");
  });

  test("Escape closes the list", async ({ page }) => {
    await page.goto("/");
    await composer(page).fill("\\");
    const list = page.getByRole("listbox", { name: /saved automations/i });
    await expect(list).toBeVisible();
    await composer(page).press("Escape");
    await expect(list).toBeHidden();
  });

  test("instructions that say nothing are refused before any run is started, and what was typed stays", async ({ page }) => {
    await page.goto("/");
    await composer(page).fill("do it");
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByText(/say what the agent should do/i)).toBeVisible();
    await expect(composer(page)).toHaveValue("do it");
  });

  test("Ctrl/Cmd+Enter submits the box", async ({ page }) => {
    await page.goto("/");
    await composer(page).fill("do it");
    await composer(page).press("ControlOrMeta+Enter");
    await expect(page.getByText(/say what the agent should do/i)).toBeVisible();
  });

  test("a command that is not a saved automation is refused, naming it", async ({ page }) => {
    await page.goto("/");
    await composer(page).fill("\\nope-e2e Acme Ltd");
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "\\nope-e2e" })).toBeVisible();
  });

  // Q116: every refusal read "no saved automation called ..." even for one that exists but is a draft
  test("a command to an automation that is not approved yet says so", async ({ page }) => {
    await page.goto("/");
    await composer(page).fill(`\\${AUTOMATION.command} Acme Ltd`);
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("is not approved yet");
  });

  test("the connections that are on are named under the box, with a way to Settings", async ({ page }) => {
    await page.goto("/");
    const chips = page.getByTestId("composer-connections");
    await expect(chips).toContainText(/Using|No connections on/);
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

  // Q91: the outcome said "looks good", Why? "not checked" and Details "not judged" about the same run
  test("a run checked by the first version says the same thing in the outcome, Why? and Details", async ({ page }) => {
    const panel = await openRun(page, runs.legacy);
    await expect(panel.getByTestId("outcome")).toHaveText("Done - looks good");
    await panel.getByRole("button", { name: /why\?/i }).click();
    await expect(panel.getByTestId("why")).toContainText("Checked by an earlier version of the app");
    await panel.getByRole("button", { name: /details/i }).click();
    await expect(page.getByRole("dialog", { name: /details/i }).getByTestId("verdict")).toContainText("earlier version of the app");
  });

  test("a follow-up names the run it follows and links to it; the person's own mark is shown", async ({ page }) => {
    const panel = await openRun(page, runs.followUp);
    const link = panel.getByRole("link", { name: /follows up/i });
    await expect(link).toContainText(TITLES.parent);
    await expect(link).toHaveAttribute("href", `/?run=${runs.parent}`);
    await expect(panel).toContainText("You marked this: looks right");
  });

  test("the plan is drawn as the thread, a doubted step says so, and a stopped guard is said in plain words", async ({ page }) => {
    const panel = await openRun(page, runs.followUp);
    const thread = panel.getByTestId("thread");
    await expect(thread.getByRole("listitem")).toHaveCount(3);
    await expect(thread.getByRole("listitem").nth(1)).toContainText("This step may not have done what it says. It found two facts, not three.");
    await expect(thread.getByText(/may not have done what it says/)).toHaveCount(1); // the on-track steps are not flagged
    await expect(panel.getByTestId("plan-progress")).toHaveText("3 of 3 done");

    await expect(panel.getByTestId("guard-notices")).toContainText("A web page tried to make the agent send your data elsewhere. It was stopped.");
    await expect(panel.getByTestId("guard-notices")).not.toContainText("carries the task"); // the raw reason is for Details
  });

  test("what it made: a chart shows itself, a CSV its rows and columns, a spreadsheet its sheets, a held-back file asks first", async ({ page }) => {
    const panel = await openRun(page, runs.followUp);
    const files = panel.getByTestId("files");
    await expect(files.getByRole("img", { name: /chart\.svg/ })).toHaveAttribute("src", `/api/runs/${runs.followUp}/files/chart.svg?inline=1`);
    await expect(files).toContainText("3 rows with name and email");
    await expect(files).toContainText("One sheet, Measures, with 2 rows");
    await expect(files).toContainText("Contains 3 email addresses");
    await expect(files.getByRole("link", { name: /download anyway/i })).toHaveAttribute("href", `/api/runs/${runs.followUp}/files/keys.txt?confirm=1`);
    await expect(files.getByRole("link", { name: /^Download contacts\.csv \(\d+ bytes\)$/ })).toBeVisible(); // Q72, Q99
  });

  test("the report renders its tables", async ({ page }) => {
    const panel = await openRun(page, runs.followUp);
    const table = panel.getByTestId("report").getByRole("table");
    await expect(table.getByRole("columnheader", { name: "Measure" })).toBeVisible(); // Q97
    await expect(table).toContainText("238,855 miles");
  });

  test("the actions row offers Make an automation, and Ask for a change opens a box that refuses a change that says nothing", async ({ page }) => {
    const panel = await openRun(page, runs.followUp);
    const actions = panel.getByTestId("run-actions");
    await expect(actions.getByRole("link", { name: /make an automation/i })).toHaveAttribute("href", `/automations/new?run=${runs.followUp}`);
    await actions.getByRole("button", { name: /ask for a change/i }).click();
    const change = panel.getByRole("textbox", { name: /ask for a change/i });
    await expect(change).toBeFocused();
    await change.fill("ab");
    await panel.getByRole("button", { name: /send the change/i }).click();
    await expect(panel.getByText(/say what should change/i)).toBeVisible();
  });

  test("Details slides in beside the run without covering it, lists every file and no built-in tool, and leaves on Escape", async ({ page }) => {
    // React warns in the console when two list items share a key: two "content" checks once did (one per file)
    const keyWarnings: string[] = [];
    page.on("console", (m) => {
      if (/same key/i.test(m.text())) keyWarnings.push(m.text());
    });
    const panel = await openRun(page, runs.followUp);
    await expect(page.getByTestId("timeline")).toHaveCount(0);
    const opener = panel.getByRole("button", { name: /details/i });
    await opener.click();
    const details = page.getByRole("dialog", { name: /details/i });
    await expect(details.getByTestId("timeline")).toBeVisible();
    await expect(details.getByTestId("state-card")).toContainText(/turn \d+ of \d+/);
    await expect(details.getByTestId("state-card")).toContainText("chart.svg, contacts.csv, table.xlsx"); // Q103: the tools' files too
    await expect(details.getByTestId("state-card")).not.toContainText("outputs"); // Q103: the built-in tools are not a connection
    await expect(details.getByTestId("verdict")).toContainText("%"); // the probabilities live here
    await expect(details).toContainText(runs.followUp); // the id, for a bug report
    await expect(details).toContainText(/blocked/i); // the guard's raw decision

    // no scrim: the run beside it still answers
    await panel.getByRole("button", { name: /why\?/i }).click();
    await expect(panel.getByRole("button", { name: /why\?/i })).toHaveAttribute("aria-expanded", "true");

    await details.getByRole("button", { name: /close details/i }).focus();
    await page.keyboard.press("Escape");
    await expect(details).toBeHidden();
    await expect(opener).toBeFocused();
    expect(keyWarnings).toEqual([]);
  });

  test("a stopped run reads 'Stopped' and the thread shows where it stopped", async ({ page }) => {
    const panel = await openRun(page, runs.stopped);
    await expect(panel.getByTestId("outcome")).toHaveText("Stopped"); // Q114
    await expect(panel.getByTestId("thread")).toContainText(/stopped here/i);
    await expect(panel.getByRole("button", { name: /^stop$/i })).toHaveCount(0);
  });

  test("a failed run offers a labelled Run again, and no Why? that would only repeat it", async ({ page }) => {
    const panel = await openRun(page, runs.failed);
    await expect(panel.getByTestId("outcome")).toHaveText("Something went wrong");
    await expect(panel.getByRole("button", { name: "Run again", exact: true })).toBeVisible(); // Q101
    await expect(panel.getByRole("button", { name: /why\?/i })).toHaveCount(0); // Q102
  });
});

test.describe("a live run", () => {
  test("offers Stop, and pressing it either stops the run or says why it cannot", async ({ page }) => {
    const panel = await openRun(page, runs.live);
    await expect(panel.getByTestId("outcome")).toHaveText(/Working on it/);
    await expect(panel.getByTestId("files")).toContainText("Files appear here when the run finishes."); // Q122
    await panel.getByRole("button", { name: /^stop$/i }).click();
    await expect(panel.getByTestId("outcome")).toHaveText(/Stopping|Stopped/);
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
    const row = rail(page).getByRole("link").first();
    for (const el of [row, panel.getByRole("button", { name: /details/i })]) await expect(el).toHaveClass(/focus-visible:ring-\[3px\]/);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the rail is a sheet opened from the top bar, nothing scrolls sideways, and the composer floats at the bottom", async ({ page }) => {
    await openRun(page, runs.followUp);
    await expect(rail(page)).toBeHidden();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    const box = (await composer(page).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    expect(box.y).toBeGreaterThan(844 / 2);

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

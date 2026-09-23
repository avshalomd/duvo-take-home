import { expect, test, type Locator, type Page } from "@playwright/test";
import { AUTOMATION, createHomeRuns, deleteHomeRuns, HEAL, READY, TITLES, type HomeRuns } from "./home-fixture";

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
    await expect(mark.getByText("Automations", { exact: true })).toBeHidden(); // the tile shows, its word does not
  });

  test("with no run open, Home asks one question, with the composer under it", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "What should the agent do?" })).toBeVisible();
    await expect(composer(page)).toBeFocused();
    await expect(page.getByTestId("run-panel")).toHaveCount(0);
  });

  // Q137: the thread is the product's signature, and the first screen a new user sees had none
  test("the first visit shows how a run goes, as a quiet thread", async ({ page }) => {
    await page.goto("/");
    const how = page.getByRole("list", { name: "How a run goes" });
    await expect(how).toBeVisible();
    await expect(how.getByRole("listitem")).toHaveCount(3);
  });

  // Q137: a long brief took four lines of 34 px and pushed the thread below the fold
  test("a run's title takes at most two lines, and the whole brief is in its tooltip", async ({ page }) => {
    await openRun(page, runs.long);
    const title = page.locator("#run-title");
    const { height, lineHeight } = await title.evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(el).lineHeight),
    }));
    expect(height).toBeLessThanOrEqual(2 * lineHeight + 1);
    await expect(title).toHaveAttribute("title", TITLES.long);
  });

  test("the saved automations under the question are tokens that fill the box", async ({ page }) => {
    await page.goto("/");
    const token = page.getByTestId("automation-tokens").getByRole("button", { name: `/${READY.command}` });
    await token.click();
    await expect(composer(page)).toHaveValue(`/${READY.command} `);
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

    await search.fill(`/${AUTOMATION.command}`); // Q133: the called run, and an example of the same automation
    await expect(rail(page).locator(`a[href="/?run=${runs.audit}"]`)).toBeVisible();
    await expect(rail(page).locator(`a[href="/?run=${runs.example}"]`)).toBeVisible();

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

  // Q140: the outcome words took the tag's place on hover and squeezed the title to two letters
  test("hovering a rail row leaves its title as wide as it was, and the outcome is in the row's tooltip", async ({ page }) => {
    await page.goto("/");
    const row = rail(page).locator(`a[href="/?run=${runs.parent}"]`);
    const title = row.getByTestId("rail-title");
    const before = (await title.boundingBox())!.width;
    await row.hover();
    expect((await title.boundingBox())!.width).toBe(before);
    await expect(row).toHaveAttribute("title", `Done - looks good\n${TITLES.parent}`);
  });

  // Q143: a press answers with a small give, the same everywhere
  test("rail rows, New run, the top bar's pages and Why? give a little under a press", async ({ page }) => {
    const panel = await openRun(page, runs.followUp);
    const pressable = [
      rail(page).getByRole("link").first(),
      page.getByRole("link", { name: "New run" }),
      page.getByTestId("app-header").getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Automations" }),
      panel.getByRole("button", { name: /why\?/i }),
    ];
    for (const el of pressable) await expect(el).toHaveClass(/active:scale-\[0\.97\]/);
  });

  test("a run of a saved automation is named by the automation and its input", async ({ page }) => {
    await openRun(page, runs.audit);
    await expect(page.locator("#run-title")).toHaveText(`${AUTOMATION.name}: ${AUTOMATION.input}`); // Q94
    await expect(rail(page).locator(`a[href="/?run=${runs.audit}"]`)).toContainText(`${AUTOMATION.name}: ${AUTOMATION.input}`);
  });
});

test.describe("the composer", () => {
  test("typing / lists the ready automations by command and name, and picking one shows what to type next", async ({ page }) => {
    await page.goto("/");
    await composer(page).fill("/e2e-home-re");
    const list = page.getByRole("listbox", { name: /saved automations/i });
    await expect(list.getByRole("option").first()).toContainText(`/${READY.command}`);
    await expect(list.getByRole("option").first()).toContainText(READY.name);
    await composer(page).press("Enter");
    await expect(composer(page)).toHaveValue(`/${READY.command} `);
    await expect(page.getByTestId("command-hint")).toHaveText(READY.hint); // Q93
    await composer(page).press("Escape");
  });

  // his call, 2026-09-23: commands are "/audit ..."; a backslash is plain text and opens nothing
  test("a backslash does not open the list", async ({ page }) => {
    await page.goto("/");
    await composer(page).fill("\\");
    await expect(page.getByRole("listbox", { name: /saved automations/i })).toHaveCount(0);
  });

  test("Escape closes the list", async ({ page }) => {
    await page.goto("/");
    await composer(page).fill("/");
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
    await composer(page).fill("/nope-e2e Acme Ltd");
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "/nope-e2e" })).toBeVisible();
  });

  // Q116: every refusal read "no saved automation called ..." even for one that exists but is a draft
  test("a command to an automation that is not approved yet says so", async ({ page }) => {
    await page.goto("/");
    await composer(page).fill(`/${AUTOMATION.command} Acme Ltd`);
    await page.getByRole("button", { name: "Run", exact: true }).click();
    // filtered: Next's route announcer is an alert too
    await expect(page.getByRole("alert").filter({ hasText: "is not approved yet" })).toBeVisible();
  });

  test("the connections that are on are named under the box, with a way to Settings", async ({ page }) => {
    await page.goto("/");
    const chips = page.getByTestId("composer-connections");
    await expect(chips).toContainText(/Using|No connections on/);
    await expect(chips.getByRole("link").first()).toHaveAttribute("href", "/settings/connections");
  });

  // Q147: two names ran together into one ("DeepWiki e2e Settings moved")
  test("each connection that is on is a chip of its own", async ({ page }) => {
    await page.goto("/");
    const names = page.getByTestId("composer-connections").getByTestId("connection-chip");
    const count = await names.count();
    test.skip(count === 0, "the demo workspace has no connection switched on");
    for (let i = 0; i < count; i++) {
      const background = await names.nth(i).evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(background).not.toBe("rgba(0, 0, 0, 0)");
    }
  });

  // Q135: shadcn's md:text-sm made the box 14 px on a desk, while its hint and the brief as it left were 19 px
  test("the box and its hint share one type size, on the first visit and under a run", async ({ page }) => {
    const size = (el: Locator) => el.evaluate((node) => getComputedStyle(node).fontSize);
    await page.goto("/");
    await composer(page).fill(`/${READY.command} `);
    expect(await size(composer(page))).toBe("19px");
    expect(await size(page.getByTestId("command-hint"))).toBe("19px");
    await openRun(page, runs.followUp);
    expect(await size(composer(page))).toBe("15px");
  });

  // Q143: the capsule is where the keyboard is; it says so
  test("the composer's capsule draws a focus ring while the box has focus", async ({ page }) => {
    await openRun(page, runs.followUp);
    const capsule = page.getByTestId("composer-capsule");
    const ring = () => capsule.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(await ring()).toBe("none");
    await composer(page).focus();
    await expect.poll(ring).not.toBe("none");
  });
});

test.describe("the handover", () => {
  // Q138: nothing moved for about a second after Run (the server's answer), then two differently wrapped copies
  // cross-faded, then five seconds of plain text. The start is held on its way to the server here, so what is on
  // screen is what the press alone did; it is then aborted, so no run is ever started.
  test("pressing Run moves the brief into a new run's title at once, landing on a thread already at work", async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        await held;
        await route.abort();
      } else await route.continue();
    });
    await page.goto("/");
    const brief = "[e2e] home handover: list three facts about the Moon";
    await composer(page).fill(brief);
    await page.getByRole("button", { name: "Run", exact: true }).click();

    const pending = page.getByTestId("run-pending");
    await expect(pending.getByRole("heading", { level: 1 })).toHaveText(brief);
    const first = pending.getByTestId("thread").getByRole("listitem").first();
    await expect(first).toContainText("Reading your brief");
    await expect(first).toHaveAttribute("aria-current", "step"); // its bead is breathing

    // the start never reached the server: the brief comes back to the box, with the reason
    release();
    await expect(composer(page)).toHaveValue(brief);
    await expect(page.getByRole("alert").filter({ hasText: /could not reach/i })).toBeVisible();
    await expect(pending).toHaveCount(0);
  });

  test("a start the server would refuse does not move at all", async ({ page }) => {
    await page.goto("/");
    await composer(page).fill("/nope-e2e Acme Ltd");
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "/nope-e2e" })).toBeVisible();
    await expect(page.getByTestId("run-pending")).toHaveCount(0);
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

  // Q144: `table.xlsx` was set in monospace, and a report that opened with "## Report" said Report twice
  test("the report speaks in one typeface under one Report heading", async ({ page }) => {
    const panel = await openRun(page, runs.followUp);
    const report = panel.getByTestId("report");
    const font = (el: Locator) => el.evaluate((node) => getComputedStyle(node).fontFamily);
    expect(await font(report.getByText("table.xlsx"))).toBe(await font(report));
    await expect(panel.getByText("Report", { exact: true })).toHaveCount(1);
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
    await expect(details.getByTestId("state-card")).toContainText("contacts.csv, chart.svg, table.xlsx"); // Q103: the tools' files too, in the order made
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

// Auto-heal (his call, 2026-09-23): a result the check failed is fixed inside the same run, and the run says pass or
// fail only when every attempt is used. Until then it is work in progress in every view.
test.describe("a run that fixes what the check found", () => {
  test("while it fixes, it reads as progress: the attempt in the outcome line, the thread going on, the reason under Why?", async ({ page }) => {
    const panel = await openRun(page, runs.healing);
    await expect(panel.getByTestId("outcome")).toHaveText("Checking the result - fixing what the check found (attempt 1 of 2)");
    await expect(panel.getByTestId("outcome")).not.toContainText(/did not pass/i);
    const last = panel.getByTestId("thread").getByRole("listitem").last();
    await expect(last).toContainText("Fix what the check found (attempt 1 of 2)");
    await expect(last).toHaveAttribute("aria-current", "step");
    await panel.getByRole("button", { name: /why\?/i }).click();
    await expect(panel.getByTestId("why")).toContainText(`The first result did not pass the check: ${HEAL.reason}`);
  });

  test("a fixed run reads like any good run, Why? notes the fix, and Details shows what the agent was told", async ({ page }) => {
    const panel = await openRun(page, runs.healed);
    await expect(panel.getByTestId("outcome")).toHaveText("Done - looks good");
    await panel.getByRole("button", { name: /why\?/i }).click();
    await expect(panel.getByTestId("why")).toContainText("Fixed after 1 attempt");
    await panel.getByRole("button", { name: /details/i }).click();
    const timeline = page.getByRole("dialog", { name: /details/i }).getByTestId("timeline");
    await expect(timeline).toContainText("Fixing what the check found - attempt 1 of 2");
    await expect(timeline).toContainText(HEAL.feedback);
  });

  test("a run the fixes did not save says so once, and Ask for a change starts from what did not pass", async ({ page }) => {
    const panel = await openRun(page, runs.unfixed);
    await expect(panel.getByTestId("outcome")).toHaveText("Did not pass after 2 attempts to fix it");
    await panel.getByTestId("run-actions").getByRole("button", { name: /ask for a change/i }).click();
    await expect(panel.getByRole("textbox", { name: /ask for a change/i })).toHaveValue("Please fix what did not pass: At least 8 rows: 6 rows");
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

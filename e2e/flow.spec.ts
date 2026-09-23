import { expect, test, type Locator, type Page } from "@playwright/test";
import { AUTOMATION, createHomeRuns, deleteHomeRuns, FAILED_ERROR, HEAL, READY, TITLES, type HomeRuns } from "./home-fixture";

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
  test("the top bar offers the three pages, marks Home as open, and carries the Handover mark as a glyph named by its label", async ({ page }) => {
    await page.goto("/");
    const header = page.getByTestId("app-header");
    const pages = header.getByRole("navigation", { name: "Pages" });
    for (const name of ["Home", "Automations", "Settings"]) await expect(pages.getByRole("link", { name })).toBeVisible();
    await expect(pages.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    // Q113: the mark is a glyph with the product's name as its label, not a word beside the pages.
    // His call, 2026-09-23: the product is called Handover; the Automations page keeps its name.
    const mark = header.getByRole("link", { name: "Handover home" });
    await expect(mark).toBeVisible();
    await expect(mark).toHaveText("", { useInnerText: true }); // the tile shows, no word does
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
    await search.fill("e2e home follow-up distance"); // every word, in any order: the tag and the title together
    await expect(rail(page).getByRole("link")).toHaveCount(1);
    await expect(rail(page).getByRole("link")).toContainText("follow-up");

    await search.fill(`/${AUTOMATION.command}`); // Q133: the called run, and an example of the same automation
    await expect(rail(page).locator(`a[href="/?run=${runs.audit}"]`)).toBeVisible();
    await expect(rail(page).locator(`a[href="/?run=${runs.example}"]`)).toBeVisible();

    await search.fill("zzzz no run says this");
    await expect(rail(page).getByRole("link")).toHaveCount(0);
    await expect(rail(page)).toContainText(/no runs match/i);
  });

  // Q201: an unknown address showed Next's bare 404, with no frame and no way back
  test("an unknown address says so in the app's own look, with a way back to Home", async ({ page }) => {
    for (const path of ["/nope", "/settings/nope"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { name: "This page was not found" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/");
    }
  });

  // the field showed the browser's own blue clear "x"; it has a quiet clear button of its own, there only with text
  test("the rail's search clears with its own button, not the browser's", async ({ page }) => {
    await page.goto("/");
    const search = rail(page).getByRole("searchbox", { name: /search runs/i });
    const clear = rail(page).getByRole("button", { name: "Clear search" });
    await expect(clear).toHaveCount(0);
    await search.fill("zzzz no run says this");
    await clear.click();
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    await expect(clear).toHaveCount(0);
  });

  // "News digest CSV: el... /news-digest": the tag repeated the automation's name and cut the input short
  test("a rail row of a saved automation's run carries no tag that repeats its name", async ({ page }) => {
    await page.goto("/");
    await expect(rail(page).locator(`a[href="/?run=${runs.audit}"]`)).not.toContainText(`/${AUTOMATION.command}`);
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

  // his report, 2026-09-23: a hint that wraps ran over the controls under the box, because it was laid over the input
  test("a command's hint that wraps grows the box instead of running over its controls", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // a phone: the hint takes more than one line
    await page.goto("/");
    await composer(page).fill(`/${READY.command} `);
    const hint = await page.getByTestId("command-hint").boundingBox();
    const controls = await page.getByTestId("composer-connections").boundingBox();
    expect(hint && controls).toBeTruthy();
    expect(hint!.height).toBeGreaterThan(30); // the case under test: the hint really wraps
    expect(hint!.y + hint!.height).toBeLessThanOrEqual(controls!.y);
  });

  // the list opened over the composer's own Run button and connection chips, on the first visit and under a run
  test("the command list leaves the Run button and the chips uncovered", async ({ page }) => {
    const uncovered = (target: Locator) =>
      target.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return Boolean(top && el.contains(top));
      });
    for (const url of ["/", `/?run=${runs.parent}`]) {
      await page.goto(url);
      await composer(page).fill("/");
      await expect(page.getByRole("listbox", { name: /saved automations/i })).toBeVisible();
      expect(await uncovered(page.getByRole("button", { name: "Run", exact: true }))).toBe(true);
      expect(await uncovered(page.getByTestId("composer-connections"))).toBe(true);
    }
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

  // Q202: the reason stayed under the box after the text had changed; Q203: a square pink border was drawn inside the
  // rounded capsule
  test("a refusal is said in the capsule's own shape, and goes once the text changes", async ({ page }) => {
    await page.goto("/");
    await composer(page).fill("do it");
    await page.getByRole("button", { name: "Run", exact: true }).click();
    const reason = page.getByText(/say what the agent should do/i);
    await expect(reason).toBeVisible();
    // no ring or border of the box's own (a ring is a box-shadow: every layer of it is 0 px wide)
    expect(await composer(page).evaluate((el) => getComputedStyle(el).boxShadow)).not.toMatch(/\b[1-9]\d*px/);
    await expect(composer(page)).toHaveCSS("border-top-width", "0px");
    const capsule = page.getByTestId("composer-capsule");
    await expect(capsule).toHaveAttribute("data-invalid", "true"); // the capsule draws it, in its own rounded shape
    await composer(page).press("End");
    await composer(page).pressSequentially(" now");
    await expect(reason).toHaveCount(0);
    await expect(capsule).not.toHaveAttribute("data-invalid");
  });

  // Q195: a double-click on Run started two identical paid runs half a second apart. The start is never let through
  // to the server here (the request is aborted in the browser), so no run is created
  test("one press, one start: a double-click or a second Ctrl/Cmd+Enter sends the brief once", async ({ page }) => {
    let starts = 0;
    await page.route("**/*", (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        starts++;
        return route.abort();
      }
      return route.continue();
    });
    await page.goto("/");
    await composer(page).fill("[e2e] home double press: list three facts about Mars");
    await page.getByRole("button", { name: "Run", exact: true }).dblclick();
    await expect(page.getByText(/could not reach the app/i)).toBeVisible();
    expect(starts).toBe(1);

    // the lock lets go once the start is answered: the next press sends again, and only once
    await composer(page).press("ControlOrMeta+Enter");
    await composer(page).press("ControlOrMeta+Enter");
    await expect.poll(() => starts).toBe(2);
    await page.waitForTimeout(1_000);
    expect(starts).toBe(2);
  });

  // Q209: Enter makes a new line and only Cmd/Ctrl+Enter runs, and nothing said so
  test("the keyboard shortcut is named beside Run, in the platform's own words", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("run-shortcut")).toHaveText(/^(⌘|Ctrl) Enter$/);
    await expect(page.getByRole("button", { name: "Run", exact: true })).toHaveAttribute("aria-keyshortcuts", /^(Meta|Control)\+Enter$/);
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
    await expect(lines).toContainText("The judge was sure the result answers your instructions, but could not tell whether the plan was finished");
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

  test("a follow-up names the run it follows and links to it; a mark from before judges were recorded reads neutrally", async ({ page }) => {
    const panel = await openRun(page, runs.followUp);
    const link = panel.getByRole("link", { name: /follows up/i });
    await expect(link).toContainText(TITLES.parent);
    await expect(link).toHaveAttribute("href", `/?run=${runs.parent}`);
    // the fixture's mark has no judge, like rows from before human_verdict_by: never "You" unless it was you
    await expect(panel).toContainText("Marked: looks right");
    await expect(panel).not.toContainText("You marked this");
  });

  test("the plan is drawn as the thread, a doubted step says so, and a stopped guard is said in plain words", async ({ page }) => {
    const panel = await openRun(page, runs.followUp);
    const thread = panel.getByTestId("thread");
    await expect(thread.getByRole("listitem")).toHaveCount(3);
    // Q153: said once; the checker's note only repeated the step's own, so it is not added
    await expect(thread.getByRole("listitem").nth(1)).toContainText("This step may not have done what it says.");
    await expect(thread.getByRole("listitem").nth(1)).not.toContainText("It found two facts, not three.");
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

  // a chart styles itself for the viewer's scheme; a white box behind it put its light dark-mode text on white
  test("a chart's preview sits on the sheet's paper, in light and in dark", async ({ page }) => {
    for (const [scheme, paper] of [["light", "rgb(255, 255, 255)"], ["dark", "rgb(21, 28, 38)"]] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      const panel = await openRun(page, runs.followUp);
      await expect(panel.getByTestId("files").getByRole("img", { name: /chart\.svg/ })).toHaveCSS("background-color", paper);
    }
  });

  // Q205: a follow-up's carried-over spreadsheet lost its "One sheet, ... with ... rows" line
  test("a follow-up's carried-over spreadsheet says its sheets, as it did on the run that made it", async ({ page }) => {
    const panel = await openRun(page, runs.carried);
    await expect(panel.getByTestId("files")).toContainText("One sheet, Measures, with 2 rows");
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
    // Q198: a finished run says its total, not "turn 17 of 25" as if it were still counting
    await expect(details.getByTestId("state-card")).toContainText(/succeeded - \d+ turns?/);
    await expect(details.getByTestId("state-card")).not.toContainText(/turn \d+ of \d+/);
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

  // Q208: with the model down the result was never checked, and the only way to check it again was inside Details.
  // Check again is not pressed here: it would call the model
  test("a result nobody could check says so in words beside the outcome, with Check again there", async ({ page }) => {
    const panel = await openRun(page, runs.unchecked);
    await expect(panel.getByTestId("outcome")).toHaveText("Done - not checked");
    await expect(panel.getByTestId("not-checked")).toContainText("The result was not checked: the checker could not be reached.");
    await expect(panel.getByTestId("not-checked").getByRole("button", { name: "Check again" })).toBeVisible();

    const checked = await openRun(page, runs.parent); // a run that was checked has nothing to check again here
    await expect(checked.getByTestId("not-checked")).toHaveCount(0);
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

  // the banner sent the reader to Details, where there was only a red monospace raw error; and Details still showed
  // a pending Planning and a call "waiting for the result..." on a run that had ended
  test("a failed run says why in plain words, and Details shows nothing still waiting", async ({ page }) => {
    const panel = await openRun(page, runs.failed);
    await expect(panel.getByTestId("failure")).toContainText("It ran out of time before it finished.");
    await expect(panel.getByTestId("failure")).not.toContainText(FAILED_ERROR);
    await panel.getByRole("button", { name: /details/i }).click();
    const details = page.getByRole("dialog", { name: /details/i });
    await expect(details).toContainText(FAILED_ERROR); // the raw error is kept, for a bug report
    const timeline = details.getByTestId("timeline");
    await expect(timeline).toContainText("no result: the run ended before this call answered");
    await expect(timeline).not.toContainText(/waiting/i);
    await expect(timeline.getByLabel("Stopped here")).toHaveCount(1);
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
    // HEAL.reason is "At least 8 rows: 3 rows": said in one sentence, lower case, with no chain of colons
    await expect(panel.getByTestId("why")).toContainText("The first result did not pass the check: at least 8 rows (3 rows)");
  });

  test("a fixed run reads like any good run, Why? notes the fix, and Details shows what the agent was told", async ({ page }) => {
    const panel = await openRun(page, runs.healed);
    await expect(panel.getByTestId("outcome")).toHaveText("Done - looks good");
    await panel.getByRole("button", { name: /why\?/i }).click();
    await expect(panel.getByTestId("why")).toContainText("Fixed after 1 attempt");
    await panel.getByRole("button", { name: /details/i }).click();
    const details = page.getByRole("dialog", { name: /details/i });
    const timeline = details.getByTestId("timeline");
    await expect(timeline).toContainText("Fixing what the check found - attempt 1 of 2");
    await expect(timeline).toContainText(HEAL.feedback);
    // Q149: each attempt shows its own cost, and the run one total - never the SDK's running total per attempt
    await expect(timeline).toContainText("$0.050");
    await expect(details.getByTestId("state-card")).toContainText("$0.170");
  });

  // the steps were drawn as red circles with a check mark: "done" and "failed" at once. The steps did run; the
  // outcome line is where the result's failure is said
  test("on a run whose result did not pass, the steps that ran look done and only the outcome is red", async ({ page }) => {
    const panel = await openRun(page, runs.unfixed);
    await expect(panel.getByTestId("outcome")).toContainText("Did not pass");
    const done = panel.getByTestId("thread").getByText("Done", { exact: true });
    await expect(done).toHaveCount(5); // the plan's three steps and the two fixes
    for (const node of await done.all()) await expect(node.locator("..")).toHaveCSS("background-color", "rgb(21, 132, 90)"); // fern
  });

  test("a run the fixes did not save says so once, and Ask for a change starts from what did not pass", async ({ page }) => {
    const panel = await openRun(page, runs.unfixed);
    await expect(panel.getByTestId("outcome")).toHaveText("Did not pass after 2 attempts to fix it");
    await panel.getByTestId("run-actions").getByRole("button", { name: /ask for a change/i }).click();
    await expect(panel.getByRole("textbox", { name: /ask for a change/i })).toHaveValue("Please fix what did not pass: At least 8 rows: 6 rows");
  });
});

test.describe("a run whose fixes stopped making progress", () => {
  // Q148: the engine stops when a fix undoes an earlier one or fails the same way; it records why, and does not count it
  test("says it stopped trying in plain words, counts only the fixes made, and keeps the engine's reason for Details", async ({ page }) => {
    const panel = await openRun(page, runs.stuck);
    await expect(panel.getByTestId("outcome")).toHaveText("Did not pass after 1 attempt to fix it");
    await panel.getByRole("button", { name: /why\?/i }).click();
    await expect(panel.getByTestId("why")).toContainText("Stopped trying: the first fix did not get the result any closer to passing");
    await panel.getByRole("button", { name: /details/i }).click();
    const timeline = page.getByRole("dialog", { name: /details/i }).getByTestId("timeline");
    await expect(timeline).toContainText("Stopped trying - attempt 2 of 2");
    await expect(timeline).toContainText(HEAL.stopped);
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

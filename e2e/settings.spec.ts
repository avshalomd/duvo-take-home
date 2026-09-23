import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { neon } from "@neondatabase/serverless";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { deleteUsers, e2eEmail, joinByRow, signedInAs } from "./auth-helpers";

// Settings in a browser: a connection added with a token, edited, switched off and deleted; a limit changed and
// kept. Runs against a dev server on the demo workspace:
//   BASE_URL=http://localhost:3009 npx playwright test e2e/settings.spec.ts
// A connection name allows letters, digits, spaces, - and _ only, so what it creates is named "e2e Settings ..." (the
// "[e2e]" prefix would be refused by the form) and deleted by the test itself, with a database sweep as the net.
const NAME = "e2e Settings server";
const RENAMED = "e2e Settings renamed";
const TOKEN = "e2e-secret-token-value";

// Every test starts signed in as the demo user (an owner): the "setup" project in playwright.config.ts signs in once.
const open = (page: Page, path: string) => page.goto(path);
// A server's row in the Connections group. Its Edit and Delete sit on the row's second level: openRow unfolds it.
const rowOf = (page: Page, name: string) => page.getByTestId("connections").getByRole("listitem").filter({ hasText: name });
const openRow = (row: Locator) => row.getByRole("button", { expanded: false }).click();
const INVITED = `e2e-invite-${Date.now()}@example.com`;

// Q147: the spec writes to the shared database, so it must always be able to clean up. A plain `npx playwright test`
// has no DATABASE_URL in its environment, and the sweep used to be skipped then: an "e2e Settings moved" connection
// was left switched on in the demo workspace. Now the URL is read from .env.local when the shell did not set it (that
// one variable only), and the spec refuses to start without it rather than leave rows behind.
function databaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return existsSync(".env.local") ? parseEnv(readFileSync(".env.local", "utf8")).DATABASE_URL : undefined;
}

test.beforeAll(() => {
  if (!databaseUrl()) throw new Error("e2e/settings.spec.ts creates rows and needs DATABASE_URL (or .env.local) to delete them afterwards");
});

// afterAll runs when a test failed too, so whatever a broken test created is still removed, found by its name.
test.afterAll(async () => {
  const sql = neon(databaseUrl()!);
  await sql.query("delete from connections where name ilike 'e2e_settings%'"); // this spec's names only, any case or separator ("E2E-settings Twin")
  await sql.query("delete from invitation where email like 'e2e-invite-%@example.com'");
});

test("a connection is added with a token, edited, switched off and deleted", async ({ page }) => {
  await open(page, "/settings/connections");
  await expect(page.getByRole("link", { name: "Connections" })).toHaveAttribute("aria-current", "page");

  // Add
  await page.getByRole("button", { name: /add a server/i }).click();
  const add = page.getByRole("dialog");
  await add.getByLabel("Name").fill(NAME);
  await add.getByLabel("Address").fill("https://example.com/mcp");
  await add.getByLabel("With a token").check();
  await add.getByLabel("Token", { exact: true }).fill(TOKEN); // exact: "With a token" is a label too
  await add.getByRole("button", { name: "Add" }).click();
  await expect(add).toBeHidden();

  const row = rowOf(page, NAME);
  await expect(row).toContainText("example.com");
  await expect(page.locator("body")).not.toContainText(TOKEN); // the token is never rendered back

  // Edit, from the row's second level: rename it, keep the token by leaving the field empty
  await openRow(row);
  await expect(row).toContainText("Signs in with a saved token");
  await row.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog");
  await expect(edit.getByLabel("Name")).toHaveValue(NAME);
  await expect(edit.getByLabel("Token", { exact: true })).toHaveValue(""); // the saved token is never put back in the field
  await edit.getByLabel("Name").fill(RENAMED);
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toBeHidden();
  const renamed = rowOf(page, RENAMED);
  await expect(renamed).toBeVisible();
  await expect(renamed).not.toContainText(/needs a token/i); // the saved token was kept

  // Toggle it off, and it stays off after a reload
  const toggle = renamed.getByRole("switch");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText(`${RENAMED} off for the next run`)).toBeVisible(); // the toast only comes once the server saved it
  await page.reload();
  await expect(rowOf(page, RENAMED).getByRole("switch")).toHaveAttribute("aria-checked", "false");

  // Delete, after a confirmation
  await openRow(rowOf(page, RENAMED));
  await rowOf(page, RENAMED).getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog");
  await expect(confirm).toContainText(RENAMED);
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(rowOf(page, RENAMED)).toHaveCount(0);
});

test("a refused server keeps the sign-in choice and everything typed, the token included", async ({ page }) => {
  await open(page, "/settings/connections");
  await page.getByRole("button", { name: /add a server/i }).click();
  const add = page.getByRole("dialog");
  await add.getByLabel("Name").fill("e2e Settings refused");
  await add.getByLabel("Address").fill("http://192.168.1.4/mcp"); // a private address: refused by the contract
  await add.getByLabel("With a token").check();
  await add.getByLabel("Token", { exact: true }).fill(TOKEN);
  await add.getByRole("button", { name: "Add" }).click();

  await expect(add.getByText(/private or local network/)).toBeVisible();
  await expect(add.getByLabel("With a token")).toBeChecked(); // React's form reset used to put it back on "No sign-in"
  await expect(add.getByLabel("Name")).toHaveValue("e2e Settings refused");
  await expect(add.getByLabel("Token", { exact: true })).toHaveValue(TOKEN);
  await add.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("connections")).not.toContainText("e2e Settings refused"); // nothing was created
});

test("a second server whose name a run could not tell apart is refused, naming the first", async ({ page }) => {
  await open(page, "/settings/connections");
  await page.getByRole("button", { name: /add a server/i }).click();
  const add = page.getByRole("dialog");
  await add.getByLabel("Name").fill("e2e Settings twin");
  await add.getByLabel("Address").fill("https://example.com/twin");
  await add.getByRole("button", { name: "Add" }).click();
  await expect(add).toBeHidden();

  await page.getByRole("button", { name: /add a server/i }).click();
  const again = page.getByRole("dialog");
  await again.getByLabel("Name").fill("E2E-settings Twin"); // the same name to a run: e2e_settings_twin
  await again.getByLabel("Address").fill("https://example.com/twin2");
  await again.getByRole("button", { name: "Add" }).click();
  await expect(again.getByText("That name is already used by e2e Settings twin")).toBeVisible();
  await expect(again.getByLabel("Name")).toHaveAttribute("aria-invalid", "true");
  await again.getByRole("button", { name: "Cancel" }).click();
  await expect(rowOf(page, "E2E-settings Twin")).toHaveCount(0);

  const row = rowOf(page, "e2e Settings twin");
  await openRow(row);
  await row.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(row).toHaveCount(0);
});

test("moving a connection to another server warns that the saved token stays behind, and then asks for a new one", async ({ page }) => {
  await open(page, "/settings/connections");
  await page.getByRole("button", { name: /add a server/i }).click();
  const add = page.getByRole("dialog");
  await add.getByLabel("Name").fill("e2e Settings moved");
  await add.getByLabel("Address").fill("https://example.com/mcp");
  await add.getByLabel("With a token").check();
  await add.getByLabel("Token", { exact: true }).fill(TOKEN);
  await add.getByRole("button", { name: "Add" }).click();
  await expect(add).toBeHidden();

  const row = rowOf(page, "e2e Settings moved");
  await openRow(row);
  await row.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog");
  await edit.getByLabel("Address").fill("https://example.com/v2/mcp");
  await expect(edit.getByText(/different server/)).toHaveCount(0); // the same server: nothing to warn about
  await edit.getByLabel("Address").fill("https://attacker.example/mcp");
  await expect(edit.getByText("This is a different server, so the saved token will not be sent to it. Paste a token for the new server.")).toBeVisible();
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toBeHidden();
  await expect(row).toContainText("Needs a token before a run can use it"); // the status is the row's line while it needs something
  await expect(row).toContainText("https://attacker.example/mcp"); // the address, on the second level still open

  await row.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(row).toHaveCount(0);
});

test("a server that signs in with the service offers Sign in, linking to the OAuth start", async ({ page }) => {
  await open(page, "/settings/connections");
  await page.getByRole("button", { name: /add a server/i }).click();
  const add = page.getByRole("dialog");
  await add.getByLabel("Name").fill("e2e Settings oauth");
  await add.getByLabel("Address").fill("https://example.com/oauth-mcp");
  await add.getByLabel("Sign in with the service").check();
  await expect(add.getByLabel("Token", { exact: true })).toHaveCount(0); // no token to paste for this kind
  await add.getByRole("button", { name: "Add" }).click();
  await expect(add).toBeHidden();

  const row = rowOf(page, "e2e Settings oauth");
  await expect(row).toContainText("Needs you to sign in");
  await expect(row.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", /^\/api\/connections\/oauth\/start\?id=[0-9a-f-]{36}$/);

  await openRow(row);
  await row.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(row).toHaveCount(0);
});

test("coming back from the service's sign-in shows what happened once, then drops it from the address", async ({ page }) => {
  await open(page, "/settings/connections?signed_in=DeepWiki");
  await expect(page.getByText("Signed in to DeepWiki. Runs can use it now.")).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/connections$/);

  await open(page, "/settings/connections?oauth_error=cancelled");
  await expect(page.getByText("The sign-in was cancelled")).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/connections$/);
});

// Security QA: the toast used to show ?oauth_error's text word for word, so a link could make the app say anything.
test("a sign-in error in the address shows the app's own sentence, never the text it carries", async ({ page }) => {
  await open(page, `/settings/connections?oauth_error=${encodeURIComponent("Your workspace is suspended. Call +1 555 0100")}`);
  await expect(page.getByText("The sign-in did not work; start it again")).toBeVisible();
  await expect(page.getByText(/suspended|555/)).toHaveCount(0);
});

test("a changed limit is saved and shown again after a reload", async ({ page }) => {
  await open(page, "/settings/limits");
  await expect(page.getByRole("link", { name: "Limits" })).toHaveAttribute("aria-current", "page");

  const field = page.getByLabel("Runs per day", { exact: true }); // exact: the stepper's buttons are named after it
  const before = await field.inputValue();
  const changed = String(Number(before) === 99 ? 98 : 99);
  await field.fill(changed);
  await page.getByRole("button", { name: "Save limits" }).click();
  await expect(page.getByText("Limits saved")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Runs per day", { exact: true })).toHaveValue(changed);
  await expect(page.getByTestId("usage")).toContainText(`of ${changed}`); // today's meter reads the saved limit

  // put it back: the demo workspace is shared
  await page.getByLabel("Runs per day", { exact: true }).fill(before);
  await page.getByRole("button", { name: "Save limits" }).click();
  await expect(page.getByText("Limits saved").first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Runs per day", { exact: true })).toHaveValue(before);
});

test("how often the agent may fix its own result is saved, and 0 reads Off", async ({ page }) => {
  await open(page, "/settings/limits");
  const LABEL = "Let the agent fix its own result";
  const row = page.getByRole("listitem").filter({ hasText: LABEL });
  const field = page.getByLabel(LABEL, { exact: true });
  await expect(page.getByText("When the check finds a problem, the agent is told what failed and tries again, up to this many times.")).toBeVisible();
  const before = await field.inputValue();

  await field.fill("0");
  await field.blur();
  await expect(row.getByText("Off", { exact: true })).toBeVisible(); // 0 tries is the switch turned off, said as such
  await page.getByRole("button", { name: "Save limits" }).click();
  await expect(page.getByText("Limits saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(LABEL, { exact: true })).toHaveValue("0");
  await expect(page.getByRole("listitem").filter({ hasText: LABEL }).getByText("Off", { exact: true })).toBeVisible();

  // one press of + turns it back on with one try; then put the shared demo workspace back as it was
  await page.getByRole("button", { name: `Raise: ${LABEL}` }).click();
  await expect(page.getByLabel(LABEL, { exact: true })).toHaveValue("1");
  await page.getByLabel(LABEL, { exact: true }).fill(before);
  await page.getByRole("button", { name: "Save limits" }).click();
  await expect(page.getByText("Limits saved").first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(LABEL, { exact: true })).toHaveValue(before);
});

test("the members list shows who is in the workspace and their role", async ({ page }) => {
  await open(page, "/settings/members");
  await expect(page.getByRole("link", { name: "Members" })).toHaveAttribute("aria-current", "page");
  const me = page.getByTestId("members").getByRole("listitem").filter({ hasText: "demo@example.com" });
  await expect(me).toContainText("(you)");
  await expect(me).toContainText("Owner");
});

test("an owner invites someone and gets the link to send them", async ({ page }) => {
  await open(page, "/settings/members");
  await page.getByRole("button", { name: "Invite someone" }).click(); // the invite is a row that unfolds
  await page.getByLabel("Email").fill(INVITED);
  await page.getByRole("button", { name: "Create invite link" }).click();
  const link = page.getByTestId("invite-link");
  await expect(link).toContainText(`Send this link to ${INVITED}`);
  await expect(link.getByLabel("Invite link")).toHaveValue(/\/invite\/[\w-]+$/);
  await expect(page.getByLabel("Email")).toHaveValue(""); // emptied for the next person
});

// Q169: owners and admins change roles and remove people. Each person is a fresh "e2e-" account with a browser of
// their own; the owner's personal workspace is the one changed, so the shared demo workspace is never touched.
test.describe("changing roles and removing people", () => {
  const created: string[] = [];
  test.afterAll(async () => deleteUsers(created));

  const personRow = (page: Page, email: string) => page.getByTestId("members").getByRole("listitem").filter({ hasText: email });
  const roleMenu = (row: Locator, name: string) => row.getByRole("button", { name: new RegExp(`change ${name}'s role`) });

  test("an owner makes a member an admin, then removes them, and their next page opens their own workspace", async ({ playwright, browser, baseURL }) => {
    const [owner, mia] = [e2eEmail("members-owner"), e2eEmail("members-mia")];
    created.push(owner, mia);
    const olga = await signedInAs(playwright.request, browser, baseURL!, "Olga Owner", owner);
    const removed = await signedInAs(playwright.request, browser, baseURL!, "Mia Member", mia);
    try {
      await joinByRow(owner, mia, "member");
      await removed.page.goto("/");
      await expect(removed.page.getByTestId("app-header")).toContainText("Olga's workspace"); // Mia is looking at it

      const page = olga.page;
      await page.goto("/settings/members");
      await expect(personRow(page, owner).getByRole("button")).toHaveCount(0); // your own row has no controls
      const row = personRow(page, mia);
      await roleMenu(row, "Mia Member").click();
      await page.getByRole("menuitemradio", { name: /^Admin/ }).click();
      await expect(page.getByText("Mia Member is now an admin.")).toBeVisible();
      await expect(row.getByRole("button", { name: /^Admin:/ })).toBeVisible(); // the list says so without a reload

      await roleMenu(row, "Mia Member").click();
      await page.getByRole("menuitem", { name: "Remove from workspace" }).click();
      const confirm = page.getByRole("dialog");
      await expect(confirm).toContainText("Remove Mia Member?");
      await expect(confirm).toContainText("They lose access to this workspace's runs, automations and connections.");
      await confirm.getByRole("button", { name: "Remove" }).click();
      await expect(page.getByText("Mia Member was removed from the workspace.")).toBeVisible();
      await expect(row).toHaveCount(0);

      await removed.page.reload(); // her session still named Olga's workspace: it opens her own instead, no error
      await expect(removed.page.getByTestId("app-header")).toContainText("Mia's workspace");
    } finally {
      await olga.context.close();
      await removed.context.close();
    }
  });

  test("an admin changes members but not the owner, and is never offered Owner; a member only reads the list", async ({ playwright, browser, baseURL }) => {
    const [owner, adam, mia] = [e2eEmail("members-owner2"), e2eEmail("members-adam"), e2eEmail("members-mia2")];
    created.push(owner, adam, mia);
    const olga = await signedInAs(playwright.request, browser, baseURL!, "Olga Owner", owner);
    const admin = await signedInAs(playwright.request, browser, baseURL!, "Adam Admin", adam);
    const plain = await signedInAs(playwright.request, browser, baseURL!, "Mia Member", mia);
    try {
      await joinByRow(owner, adam, "admin");
      await joinByRow(owner, mia, "member");

      const page = admin.page;
      await page.goto("/settings/members");
      await expect(personRow(page, owner)).toContainText("Owner");
      await expect(personRow(page, owner).getByRole("button")).toHaveCount(0);
      await expect(personRow(page, adam).getByRole("button")).toHaveCount(0);
      await expect(page.getByText("Only an owner can change an owner.")).toBeVisible();
      await roleMenu(personRow(page, mia), "Mia Member").click();
      await expect(page.getByRole("menuitemradio")).toHaveText([/^Member/, /^Admin/]); // no Owner for an admin
      // what each gives, so the choice is made knowing it (UX R2: approving automations is an admin's too)
      await expect(page.getByRole("menuitemradio", { name: /^Member/ })).toContainText("Runs tasks, builds automations and tries them");
      await expect(page.getByRole("menuitemradio", { name: /^Admin/ })).toContainText("Also approves automations and manages settings and people");
      await expect(page.getByRole("menuitem", { name: "Remove from workspace" })).toBeVisible();
      await page.keyboard.press("Escape");

      await plain.page.goto("/settings/members");
      await expect(personRow(plain.page, adam)).toContainText("Admin");
      await expect(plain.page.getByTestId("members").getByRole("button")).toHaveCount(0); // no role menus, no Invite someone
      await expect(plain.page.getByText(/Only an owner or an admin can invite people, change roles or remove someone\./)).toBeVisible();
    } finally {
      await olga.context.close();
      await admin.context.close();
      await plain.context.close();
    }
  });

  // UX R2: a refused Remove left its sheet open behind the error
  test("a Remove refused by the server closes its sheet and says why", async ({ playwright, browser, baseURL }) => {
    test.setTimeout(60_000); // two sign-ups and a page that may compile first
    const [owner, mia] = [e2eEmail("members-owner3"), e2eEmail("members-mia3")];
    created.push(owner, mia);
    const olga = await signedInAs(playwright.request, browser, baseURL!, "Olga Owner", owner);
    const her = await signedInAs(playwright.request, browser, baseURL!, "Mia Member", mia);
    await her.context.close(); // only her account is needed
    try {
      await joinByRow(owner, mia, "member");
      const page = olga.page;
      await page.goto("/settings/members");
      await roleMenu(personRow(page, mia), "Mia Member").click();
      await page.getByRole("menuitem", { name: "Remove from workspace" }).click();
      const confirm = page.getByRole("dialog");
      await expect(confirm).toContainText("Remove Mia Member?");

      // someone else removes her while the sheet is open, so the server refuses this one
      await neon(databaseUrl()!)`
        delete from member where user_id = (select id from "user" where email = ${mia})
          and organization_id = (select m.organization_id from member m join "user" u on u.id = m.user_id where u.email = ${owner} and m.role = 'owner')`;
      await confirm.getByRole("button", { name: "Remove" }).click();
      await expect(page.getByText("That person could not be found in this workspace. Reload the page to see who is in it.")).toBeVisible();
      await expect(confirm).toHaveCount(0);
    } finally {
      await olga.context.close();
    }
  });
});

test("inviting someone who is already a member says so in plain words", async ({ page }) => {
  await open(page, "/settings/members");
  await page.getByRole("button", { name: "Invite someone" }).click();
  await page.getByLabel("Email").fill("demo@example.com");
  await page.getByRole("button", { name: "Create invite link" }).click();
  const invite = page.getByTestId("invite"); // scoped: Next's route announcer is an alert too
  await expect(invite.getByRole("alert")).toHaveText("demo@example.com is already a member of this workspace.");
  await expect(page.getByLabel("Email")).toHaveValue("demo@example.com"); // kept, to be corrected
});

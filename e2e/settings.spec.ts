import { neon } from "@neondatabase/serverless";
import { expect, test, type Page } from "@playwright/test";

// Settings in a browser: a connection added with a token, edited, switched off and deleted; a limit changed and
// kept. Runs against a dev server on the demo workspace:
//   npx dotenv -e .env.local -- env BASE_URL=http://localhost:3003 npx playwright test e2e/settings.spec.ts
// A connection name allows letters, digits, spaces, - and _ only, so what it creates is named "e2e Settings ..." (the
// "[e2e]" prefix would be refused by the form) and deleted by the test itself, with a database sweep as the net.
const NAME = "e2e Settings server";
const RENAMED = "e2e Settings renamed";
const TOKEN = "e2e-secret-token-value";

// Every test starts signed in as the demo user (an owner): the "setup" project in playwright.config.ts signs in once.
const open = (page: Page, path: string) => page.goto(path);
const INVITED = `e2e-invite-${Date.now()}@example.com`;

test.afterAll(async () => {
  if (!process.env.DATABASE_URL) return; // the tests delete their own rows; the sweep only runs when the database is reachable
  const sql = neon(process.env.DATABASE_URL);
  await sql.query("delete from connections where name like 'e2e Settings%'"); // only this spec's names: other agents share the database
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

  const row = page.getByTestId("connections").getByRole("listitem").filter({ hasText: NAME });
  await expect(row).toContainText("example.com");
  await expect(page.locator("body")).not.toContainText(TOKEN); // the token is never rendered back

  // Edit: rename it, keep the token by leaving the field empty
  await row.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog");
  await expect(edit.getByLabel("Name")).toHaveValue(NAME);
  await expect(edit.getByLabel("Token", { exact: true })).toHaveValue(""); // the saved token is never put back in the field
  await edit.getByLabel("Name").fill(RENAMED);
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toBeHidden();
  const renamed = page.getByTestId("connections").getByRole("listitem").filter({ hasText: RENAMED });
  await expect(renamed).toBeVisible();
  await expect(renamed).not.toContainText(/needs a token/); // the saved token was kept

  // Toggle it off, and it stays off after a reload
  const toggle = renamed.getByRole("switch");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText(`${RENAMED} off for the next run`)).toBeVisible(); // the toast only comes once the server saved it
  await page.reload();
  await expect(page.getByTestId("connections").getByRole("listitem").filter({ hasText: RENAMED }).getByRole("switch")).toHaveAttribute(
    "aria-checked",
    "false",
  );

  // Delete, after a confirmation
  await page.getByTestId("connections").getByRole("listitem").filter({ hasText: RENAMED }).getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog");
  await expect(confirm).toContainText(RENAMED);
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("connections").getByRole("listitem").filter({ hasText: RENAMED })).toHaveCount(0);
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

  const row = page.getByTestId("connections").getByRole("listitem").filter({ hasText: "e2e Settings oauth" });
  await expect(row).toContainText("needs you to sign in");
  await expect(row.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", /^\/api\/connections\/oauth\/start\?id=[0-9a-f-]{36}$/);

  await row.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(row).toHaveCount(0);
});

test("coming back from the service's sign-in shows what happened once, then drops it from the address", async ({ page }) => {
  await open(page, "/settings/connections?signed_in=DeepWiki");
  await expect(page.getByText("Signed in to DeepWiki. Runs can use it now.")).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/connections$/);

  await open(page, "/settings/connections?oauth_error=The%20sign-in%20was%20cancelled");
  await expect(page.getByText("The sign-in was cancelled")).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/connections$/);
});

test("a changed limit is saved and shown again after a reload", async ({ page }) => {
  await open(page, "/settings/limits");
  await expect(page.getByRole("link", { name: "Limits" })).toHaveAttribute("aria-current", "page");

  const field = page.getByLabel("Runs per day");
  const before = await field.inputValue();
  const changed = String(Number(before) === 99 ? 98 : 99);
  await field.fill(changed);
  await page.getByRole("button", { name: "Save limits" }).click();
  await expect(page.getByText("Limits saved")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Runs per day")).toHaveValue(changed);
  await expect(page.getByTestId("usage")).toContainText(`of ${changed}`); // today's meter reads the saved limit

  // put it back: the demo workspace is shared
  await page.getByLabel("Runs per day").fill(before);
  await page.getByRole("button", { name: "Save limits" }).click();
  await expect(page.getByText("Limits saved").first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Runs per day")).toHaveValue(before);
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
  await page.getByLabel("Email").fill(INVITED);
  await page.getByRole("button", { name: "Create invite link" }).click();
  const link = page.getByTestId("invite-link");
  await expect(link).toContainText(`Send this link to ${INVITED}`);
  await expect(link.getByLabel("Invite link")).toHaveValue(/\/invite\/[\w-]+$/);
  await expect(page.getByLabel("Email")).toHaveValue(""); // emptied for the next person
});

test("inviting someone who is already a member says so in plain words", async ({ page }) => {
  await open(page, "/settings/members");
  await page.getByLabel("Email").fill("demo@example.com");
  await page.getByRole("button", { name: "Create invite link" }).click();
  const invite = page.locator("section", { has: page.getByRole("heading", { name: "Invite someone" }) }); // Next's route announcer is an alert too
  await expect(invite.getByRole("alert")).toHaveText("demo@example.com is already a member of this workspace.");
  await expect(page.getByLabel("Email")).toHaveValue("demo@example.com"); // kept, to be corrected
});

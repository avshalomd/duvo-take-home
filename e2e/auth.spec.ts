import { expect, test } from "@playwright/test";
import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  E2E_PASSWORD,
  SIGNED_OUT,
  deleteUsers,
  e2eEmail,
  formError,
  inviteByRow,
  signInThroughUi,
  signUpThroughUi,
} from "./auth-helpers";

// Getting in and out. Local only (it creates accounts):
// BASE_URL=http://localhost:3004 npx playwright test e2e/auth.spec.ts
test.use({ storageState: SIGNED_OUT });

const created: string[] = [];
test.afterAll(async () => deleteUsers(created));

test("signing up creates a personal workspace and lands on Home", async ({ page }) => {
  const email = e2eEmail("signup");
  created.push(email);
  await signUpThroughUi(page, "Erin Tester", email);
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.getByTestId("app-header")).toContainText("Erin's workspace");
});

// Q110: the way to sign in is a link, and it brings the email along.
test("signing up with an email that already has an account links to sign-in with the email filled in", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Someone Else");
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill("another-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(formError(page)).toContainText("There is already an account with that email.");
  await formError(page).getByRole("link", { name: "Sign in instead" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/sign-in" && url.searchParams.get("email") === DEMO_EMAIL);
  await expect(page.getByLabel("Email")).toHaveValue(DEMO_EMAIL);
});

test("sign-in sets the example thread beside the form, and it draws itself through to done", async ({ page }) => {
  await page.goto("/sign-in");
  const thread = page.getByTestId("thread");
  const email = page.getByLabel("Email");
  await expect(thread).toBeVisible();
  const [t, f] = [await thread.boundingBox(), await email.boundingBox()];
  expect(t!.x + t!.width).toBeLessThanOrEqual(f!.x); // left of the form, not above it
  await expect(thread.getByText("Done", { exact: true })).toHaveCount(3, { timeout: 10_000 });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the example thread shrinks to a strip above the form, and nothing sticks out sideways", async ({ page }) => {
    await page.goto("/sign-in");
    const [t, f] = [await page.getByTestId("thread").boundingBox(), await page.getByLabel("Email").boundingBox()];
    expect(t!.y + t!.height).toBeLessThanOrEqual(f!.y);
    expect(t!.height).toBeLessThanOrEqual(120); // a strip, not the desktop illustration
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  // Q113: the phone's top bar has room for one name; it is the workspace's, because that is what the page shows.
  test("the user menu names the current workspace", async ({ page }) => {
    await page.goto("/sign-in");
    await signInThroughUi(page, DEMO_EMAIL, DEMO_PASSWORD);
    await page.waitForURL((url) => url.pathname === "/");
    const trigger = page.getByTestId("app-header").getByRole("button", { name: /Demo/ });
    await expect(trigger).toContainText("Demo workspace");
    await trigger.click();
    await expect(page.getByRole("menu")).toContainText(DEMO_EMAIL); // who is signed in, inside the menu
  });
});

test("a wrong password shows the error and stays on the sign-in page", async ({ page }) => {
  await page.goto("/sign-in");
  await signInThroughUi(page, DEMO_EMAIL, "not-the-password");
  await expect(formError(page)).toHaveText("That email and password do not match.");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("a signed-out visit to / goes to /sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL((url) => url.pathname === "/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("signing in returns to the page that was asked for", async ({ page }) => {
  await page.goto("/automations");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fautomations/);
  await signInThroughUi(page, DEMO_EMAIL, DEMO_PASSWORD);
  await expect(page).toHaveURL((url) => url.pathname === "/automations");
});

// Q130: the cookie is there (so the proxy lets the request through) but no session matches it.
test("a stale session cookie on a deep link still returns there after signing in", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "better-auth.session_token", value: "e2e-stale.token", url: baseURL! }]);
  await page.goto("/automations?tab=mine");
  await expect(page).toHaveURL((url) => url.pathname === "/sign-in" && url.searchParams.get("next") === "/automations?tab=mine");
  await signInThroughUi(page, DEMO_EMAIL, DEMO_PASSWORD);
  await expect(page).toHaveURL((url) => url.pathname === "/automations" && url.searchParams.get("tab") === "mine");
});

test("a signed-out API call answers 401, not a redirect to a page", async ({ request }) => {
  const res = await request.get("/api/runs", { maxRedirects: 0 });
  expect(res.status()).toBe(401);
});

test("signing out from the user menu ends the session", async ({ page }) => {
  await page.goto("/sign-in");
  await signInThroughUi(page, DEMO_EMAIL, DEMO_PASSWORD);
  await page.waitForURL((url) => url.pathname === "/");
  await page.getByRole("button", { name: /Demo/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/sign-in");
  await page.goto("/");
  await expect(page).toHaveURL((url) => url.pathname === "/sign-in");
});

test("an invitation link lets a new person create an account and join the workspace", async ({ browser, page }) => {
  const owner = e2eEmail("owner");
  const invitee = e2eEmail("invitee");
  created.push(owner, invitee);
  await signUpThroughUi(page, "Olga Owner", owner);
  const invitationId = await inviteByRow(owner, invitee);

  const guest = await browser.newContext({ storageState: SIGNED_OUT });
  try {
    const guestPage = await guest.newPage();
    await guestPage.goto(`/invite/${invitationId}`);
    await expect(guestPage.getByRole("heading", { name: "Join Olga's workspace" })).toBeVisible();
    await expect(guestPage.getByText(`Olga Owner invited ${invitee}`)).toBeVisible();

    await guestPage.getByRole("link", { name: "Create an account" }).click();
    await expect(guestPage.getByLabel("Email")).toHaveValue(invitee); // the address the invitation was sent to
    await guestPage.getByLabel("Your name").fill("Ivan Invitee");
    await guestPage.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
    await guestPage.getByRole("button", { name: "Create account" }).click();

    await expect(guestPage).toHaveURL((url) => url.pathname === `/invite/${invitationId}`);
    await guestPage.getByRole("button", { name: "Join Olga's workspace" }).click();
    await expect(guestPage).toHaveURL((url) => url.pathname === "/");
    await expect(guestPage.getByTestId("app-header")).toContainText("Olga's workspace");
  } finally {
    await guest.close();
  }
});

test("a used or unknown invitation link says it is closed", async ({ page }) => {
  await page.goto("/invite/e2e-no-such-invitation");
  await expect(page.getByRole("heading", { name: "This invitation is closed" })).toBeVisible();
});

test("a new workspace made from the user menu opens at once, and the menu switches back", async ({ page }) => {
  const email = e2eEmail("switcher");
  created.push(email);
  await signUpThroughUi(page, "Sam Switcher", email);
  const header = page.getByTestId("app-header");

  await header.getByRole("button", { name: /Sam Switcher/ }).click();
  await page.getByRole("menuitem", { name: "New workspace" }).click();
  await page.getByLabel("Name").fill("E2e finance team");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(header).toContainText("E2e finance team");

  await header.getByRole("button", { name: /Sam Switcher/ }).click();
  await expect(page.getByRole("menuitemradio", { name: "E2e finance team" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("menuitemradio", { name: "Sam's workspace" }).click();
  await expect(header).toContainText("Sam's workspace");
});

test("the user menu lists the workspaces with the active one ticked", async ({ page }) => {
  await page.goto("/sign-in");
  await signInThroughUi(page, DEMO_EMAIL, DEMO_PASSWORD);
  await page.waitForURL((url) => url.pathname === "/");
  await page.getByRole("button", { name: /Demo/ }).click();
  await expect(page.getByRole("menuitemradio", { name: "Demo workspace" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("menuitem", { name: "New workspace" })).toBeVisible();
});

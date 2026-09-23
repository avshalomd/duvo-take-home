import { expect, test } from "@playwright/test";
import { DEMO_EMAIL, DEMO_PASSWORD, SIGNED_OUT, deleteUsers, e2eEmail, formError, signInThroughUi, signUpThroughUi } from "./auth-helpers";

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

test("signing up with an email that already has an account says so", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Someone Else");
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill("another-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(formError(page)).toHaveText("There is already an account with that email. Sign in instead.");
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

test("the user menu lists the workspaces with the active one ticked", async ({ page }) => {
  await page.goto("/sign-in");
  await signInThroughUi(page, DEMO_EMAIL, DEMO_PASSWORD);
  await page.waitForURL((url) => url.pathname === "/");
  await page.getByRole("button", { name: /Demo/ }).click();
  await expect(page.getByRole("menuitemradio", { name: "Demo workspace" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("menuitem", { name: "New workspace" })).toBeVisible();
});

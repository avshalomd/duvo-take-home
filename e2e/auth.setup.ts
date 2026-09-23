import { expect, test as setup } from "@playwright/test";
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_STATE, signInThroughUi } from "./auth-helpers";

// Runs before the page tests (the "setup" project): signs in as the seeded demo user the way a person would,
// and saves the cookies so every other test starts signed in without repeating the form.
setup("sign in as the demo user", async ({ page }) => {
  await page.goto("/sign-in");
  await signInThroughUi(page, DEMO_EMAIL, DEMO_PASSWORD);
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByTestId("app-header")).toContainText("Demo workspace");
  await page.context().storageState({ path: DEMO_STATE });
});

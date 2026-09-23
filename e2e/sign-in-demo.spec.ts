import { expect, test } from "@playwright/test";
import { SIGNED_OUT } from "./auth-helpers";

// The sign-in pages' example of the agent at work (src/components/auth/thread-demo.tsx). It grew as its notes
// appeared, moving the headline and itself up about 22 px, and was caught still "Working on it": it keeps one height
// from the first frame to the last, ends done in green, and stays there. Read-only: nobody signs in.
test.use({ storageState: SIGNED_OUT, viewport: { width: 1280, height: 800 } });

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`the sign-in example keeps one height and ends done, and holds (motion: ${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/sign-in");
    const card = page.getByTestId("thread-demo");
    const headline = page.getByText("Say what needs doing. Watch it get done.");
    await expect(card.getByText("Working on it")).toBeVisible();
    const before = { card: await card.boundingBox(), headline: await headline.boundingBox() };

    const done = card.getByText("Done, and invoice-totals.csv is ready.");
    await expect(done).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(1_500); // drawn once: it stays done
    await expect(done).toBeVisible();
    expect(await card.boundingBox()).toEqual(before.card);
    expect(await headline.boundingBox()).toEqual(before.headline);
  });
}

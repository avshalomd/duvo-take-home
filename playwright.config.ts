import { defineConfig, devices } from "@playwright/test";

// Local by default (starts `npm run dev`); set BASE_URL to smoke-test a deployment.
const baseURL = process.env.BASE_URL ?? "http://localhost:3000";

// The demo user's signed-in browser state, written by e2e/auth.setup.ts. Under test-results/, which git ignores.
const DEMO_STATE = "test-results/.auth/demo.json";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    // Signs in once through the UI, so every page test starts signed in as the demo user.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      testIgnore: [/smoke\.spec\.ts/, /auth\.setup\.ts/],
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: DEMO_STATE },
    },
    // Read-only and without an account, so it can run against any deployment: `BASE_URL=<url> npx playwright test --project smoke`.
    { name: "smoke", testMatch: /smoke\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 60_000 },
});

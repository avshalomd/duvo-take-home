// Shared by the auth and tenancy specs: sign up through the UI, and delete the users a spec created.
// Local only: the specs write accounts, so they never run against a deployment others are looking at.
import { existsSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { expect, type Page } from "@playwright/test";

// Same path as DEMO_STATE in playwright.config.ts: the demo user's signed-in state from auth.setup.ts.
export const DEMO_STATE = "test-results/.auth/demo.json";
export const DEMO_EMAIL = "demo@example.com";
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";
export const E2E_PASSWORD = "e2e-password-123";

// A browser with no cookies: these specs are about getting in, so they start signed out.
export const SIGNED_OUT = { cookies: [], origins: [] };

/** A fresh address per test; the "e2e-" prefix marks it as a test account if a clean-up is ever missed. */
export function e2eEmail(what: string) {
  return `e2e-${what}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@example.com`;
}

// The form's error: role="alert" with text. Next's route announcer is an empty role="alert" on every page.
export const formError = (page: Page) => page.getByRole("alert").filter({ hasText: /\S/ });

export async function signUpThroughUi(page: Page, name: string, email: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByTestId("app-header")).toBeVisible();
}

export async function signInThroughUi(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/**
 * Deletes the given accounts and the workspaces they own (the demo workspace is owned by the demo user, so an
 * e2e user invited into it never takes it along). Members, sessions and accounts go by cascade.
 */
export async function deleteUsers(emails: string[]) {
  if (emails.length === 0) return;
  if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");
  const sql = neon(process.env.DATABASE_URL!);
  const owned = await sql`
    select m.organization_id as id from member m join "user" u on u.id = m.user_id
    where u.email = any(${emails}) and m.role = 'owner'`;
  const ids = owned.map((r) => r.id as string);
  if (ids.length) {
    await sql`delete from workspace_settings where workspace_id = any(${ids})`;
    await sql`delete from organization where id = any(${ids})`;
  }
  await sql`delete from "user" where email = any(${emails})`;
}

import { expect, test as setup } from "@playwright/test";

/** Must match `playwright.config.ts`. Declared here rather than imported from
 *  it, because the config cannot import a spec without loading the test runner
 *  before it is configured. */
const STORAGE_STATE = "e2e/.auth/session.json";

/**
 * Signs in once and saves the cookie for every other spec to reuse.
 *
 * Not a convenience: Spira allows exactly one live session per account and rate
 * limits logins by IP, so a suite where each test signs in for itself would
 * invalidate its own siblings' sessions and then lock the account out.
 */
setup("authenticate", async ({ page }) => {
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  setup.skip(!username || !password, "set E2E_USERNAME and E2E_PASSWORD in .env.test.local");

  await page.goto("/login/");
  await page.fill('input[name="username"]', username as string);
  await page.fill('input[type="password"]', password as string);
  await page.click('button[type="submit"]');

  // The form finishes with router.replace() — a soft navigation that never
  // fires a `load` event, so waitForURL's default wait would sit there until it
  // timed out. The sidebar appearing is the real signal that the authenticated
  // shell rendered, and it is what the saved session has to be good for.
  await expect(page.locator("nav")).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/projects/);
  await page.context().storageState({ path: STORAGE_STATE });
});

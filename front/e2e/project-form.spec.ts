import { expect, test } from "@playwright/test";

/**
 * The create → edit → archive round trip for a project (SPI-19).
 *
 * The project it creates is real and stays in the database, archived, because
 * there is no DELETE for projects — archiving is the only way out, by design.
 * Hence the run-specific key: a fixed one would 409 against its own leftovers
 * on the second run. They cost nothing (archived projects are off every list)
 * and `pnpm seed -- --wipe` clears them if they ever get in the way.
 */
const RUN = String(Date.now()).slice(-3);
const KEY = `TST${RUN}`.slice(0, 5);
const NAME = `E2E fixture ${RUN}`;

test.describe.configure({ mode: "serial" });

test("suggests a key from the name and refuses the ones the routes have taken", async ({ page }) => {
  await page.goto("/projects/new/");

  const name = page.locator("#project-name");
  const key = page.locator("#project-key");

  await name.fill("Zeus dashboard");
  // Suggested by the API, not computed in the browser — so this also proves the
  // debounced GET /projects/suggest-key round trip. `ZEU` itself belongs to the
  // seeded Zeus project, so what comes back is the de-duplicated `ZEU2`; the
  // pattern keeps the test true whatever the workspace already holds.
  await expect(key).toHaveValue(/^ZEU\d?$/, { timeout: 5_000 });

  // Typing over the suggestion stops it for good.
  await key.fill("new");
  await expect(key).toHaveValue("NEW");
  await expect(page.getByText(/reserved by the app's own routes/)).toBeVisible();

  await name.fill("Zeus dashboard renamed");
  await expect(key).toHaveValue("NEW");

  // The other two key rules, in the same field.
  await key.fill("199");
  await expect(page.getByText(/would read as an issue number/)).toBeVisible();

  await key.fill("a");
  await expect(page.getByText(/2 to 5 letters or digits/)).toBeVisible();
});

test("creates a project, edits it, then archives it", async ({ page }) => {
  await page.goto("/projects/new/");

  await page.locator("#project-name").fill(NAME);
  await page.locator("#project-key").fill(KEY);
  await page.locator("#project-summary").fill("Created by the e2e suite");
  await page.locator("#project-icon").fill("rocket_launch");

  await expect(page.getByText(`${KEY}-1`)).toBeVisible();

  await page.getByRole("button", { name: "Create project" }).click();

  await expect(page).toHaveURL(new RegExp(`/${KEY.toLowerCase()}/overview`), { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: NAME })).toBeVisible();
  await expect(page.getByText("Created by the e2e suite")).toBeVisible();

  // Edit: the form opens on the saved values, and Save is dead until one moves.
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await expect(page.locator("#project-key")).toHaveValue(KEY);
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();

  await page.locator("#project-name").fill(`${NAME} edited`);
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page).toHaveURL(new RegExp(`/${KEY.toLowerCase()}/overview`), { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: `${NAME} edited` })).toBeVisible();

  // Archive: back to the list, and off it.
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Archive project" }).click();

  await expect(page).toHaveURL(/\/projects\/?$/, { timeout: 15_000 });
  await expect(page.getByText(`${NAME} edited`)).toHaveCount(0);
});

import { archiveIssue } from "@e2e/api";
import { expect, test } from "@playwright/test";

/**
 * The two ways to file an issue (SPI-27): the dialog, which sets every
 * property, and the list's quick-add, which sets a title and lets the group
 * imply the rest.
 *
 * Both run against the seeded Iknos project, and both archive what they created
 * on the way out so the next run sees the same four rows. What they cannot undo
 * is `Project.issueCounter` — identifiers are allocated, never reused, so IKN-5
 * stays spent. That is the design, not a leak.
 */
const RUN = String(Date.now()).slice(-4);

test.describe.configure({ mode: "serial" });

test("c opens the dialog, which files an issue with every property set", async ({ page }) => {
  const title = `Dialog fixture ${RUN}`;
  await page.goto("/ikn/issues/");

  // Nothing has focus but the document, so `c` is the create shortcut.
  await page.keyboard.press("c");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // The project comes from the URL, not from the top of the list.
  await expect(dialog.locator("#issue-project")).toHaveValue("IKN");

  await dialog.locator("#issue-title").fill(title);
  await dialog.locator("textarea").fill(`Filed from the dialog. Blocks IKN-2.`);

  // The preview is the real renderer, so the reference resolves while typing —
  // the chip carries the target's own title, which no lookalike could know.
  await expect(dialog.getByText("ECS log ingestion and retention windows")).toBeVisible({ timeout: 10_000 });

  await dialog.locator("#issue-priority").selectOption({ label: "Urgent" });
  // Index 0 is the placeholder; Iknos has exactly one epic, IKN-1.
  await dialog.locator("#issue-epic").selectOption({ index: 1 });
  await dialog.getByRole("button", { name: "Feature" }).click();

  await dialog.getByRole("button", { name: "Create issue" }).click();

  await expect(page).toHaveURL(/\/issue\/IKN-\d+/, { timeout: 15_000 });
  const identifier = new URL(page.url()).pathname.split("/")[2];

  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  // Every property the dialog set, read back off the detail page.
  await expect(page.getByText("Urgent")).toBeVisible();
  await expect(page.getByText("Feature")).toBeVisible();
  await expect(page.getByRole("link", { name: /IKN-1/ })).toBeVisible();
  await expect(page.getByText("Filed from the dialog.")).toBeVisible();

  await archiveIssue(page, identifier);
});

test("the group quick-add files into that group and stays open for the next one", async ({ page }) => {
  const title = `Quick-add fixture ${RUN}`;
  await page.goto("/ikn/issues/");

  await page.getByRole("button", { name: "Add an issue to Backlog" }).click();

  const field = page.getByRole("textbox", { name: "New issue title in Backlog" });
  await field.fill(title);
  await field.press("Enter");

  const row = page.locator('a[href^="/issue/IKN-"]').filter({ hasText: title });
  await expect(row).toBeVisible({ timeout: 15_000 });

  // Emptied but still there: the point of the quick-add is filing several.
  await expect(field).toHaveValue("");
  await expect(field).toBeVisible();

  const href = await row.getAttribute("href");
  const identifier = (href ?? "").split("/")[2];
  expect(identifier).toMatch(/^IKN-\d+$/);

  // It took the group's state rather than the API's default, which happens to
  // be the same one here — so the assertion that means something is that the
  // row landed inside the Backlog section at all.
  await expect(page.locator("section", { has: page.getByText("Backlog") }).filter({ hasText: title })).toHaveCount(1);

  await archiveIssue(page, identifier);
});

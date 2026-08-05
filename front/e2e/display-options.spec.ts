import { archiveIssue, createIssue } from "@e2e/api";
import { expect, test } from "@playwright/test";

/**
 * The display popover (COS-274). The ticket's definition of done is that
 * toggling a property updates the URL, survives a reload, and is captured when
 * saving a view — the first two are asserted here, and the third is the same
 * URL that COS-265 will store.
 */
const RUN = String(Date.now()).slice(-4);

/** Anchored: the trigger picks up a count once anything differs from default. */
const TRIGGER = /^Display/;

test.describe.configure({ mode: "serial" });

test("regroups, reorders and hides a column, all through the URL", async ({ page }) => {
  const urgent = await createIssue(page, { projectKey: "IKN", title: `Display urgent ${RUN}`, priority: 1 });

  await page.goto("/IKN/issues/");
  const row = page.getByRole("link", { name: new RegExp(urgent.identifier) });
  await expect(row).toBeVisible();

  // Opened once and left open on purpose: this is a settings panel, not a
  // one-shot menu, and changing three things should not cost three trips
  // through the trigger. That it survives each navigation is part of the claim.
  await page.getByRole("button", { name: TRIGGER }).click();

  // "Priority" is also a column and an ordering, so every control here is
  // reached by what it does rather than by its bare label.
  await page.getByRole("button", { name: "Group by Priority" }).click();
  await expect(page).toHaveURL(/group=priority/, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: /^Urgent/ })).toBeVisible();

  // Ordering goes to the server, so it shows up as a different query.
  await page.getByRole("button", { name: "Order by Created" }).click();
  await expect(page).toHaveURL(/order=created/, { timeout: 15_000 });

  // A column off is a column off the row.
  await page.getByRole("button", { name: "Show the Identifier column" }).click();
  await expect(page).toHaveURL(/cols=/, { timeout: 15_000 });
  await page.keyboard.press("Escape");

  // The identifier is gone from the row, but the row is still there — located
  // by its title now, since its identifier is what was just hidden.
  await expect(page.getByText(`Display urgent ${RUN}`)).toBeVisible();
  await expect(row).toHaveCount(0);

  // Nothing but the URL is holding any of this.
  await page.reload();
  await expect(page).toHaveURL(/group=priority/);
  await expect(page).toHaveURL(/order=created/);
  await expect(row).toHaveCount(0);
  await expect(page.getByText(`Display urgent ${RUN}`)).toBeVisible();

  // Reset puts every setting back and leaves the query clean.
  await page.getByRole("button", { name: TRIGGER }).click();
  await page.getByRole("button", { name: "Reset to default" }).click();

  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(page).not.toHaveURL(/group=|order=|cols=/);

  await archiveIssue(page, urgent.identifier);
});

test("shows empty groups only when asked", async ({ page }) => {
  await page.goto("/IKN/issues/");

  // Canceled holds nothing in the seeded project, so it is absent by default.
  const canceled = page.getByRole("button", { name: /^Canceled/ });
  await expect(canceled).toHaveCount(0);

  await page.getByRole("button", { name: TRIGGER }).click();
  await page.getByRole("button", { name: "Empty groups" }).click();

  await expect(page).toHaveURL(/empty=true/, { timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(canceled).toBeVisible();
});

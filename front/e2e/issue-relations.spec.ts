import { archiveIssue, createIssue } from "@e2e/api";
import { expect, test } from "@playwright/test";

/**
 * Adding and removing relations (SPI-31), and the thing that makes the pair
 * worth testing end to end: `blocked_by` is not a stored type. Writing "A
 * blocks B" from A must be what B reads as "blocked by A", because it is the
 * same row seen from the other end — so the spec walks to the other issue and
 * checks the mirror rather than trusting the page that wrote it.
 */
const RUN = String(Date.now()).slice(-4);

test.describe.configure({ mode: "serial" });

test("adds a block from one end, reads it from the other, then removes it", async ({ page }) => {
  const blocker = await createIssue(page, { projectKey: "IKN", title: `Relation blocker ${RUN}` });
  const blocked = await createIssue(page, { projectKey: "IKN", title: `Relation blocked ${RUN}` });

  await page.goto(`/issue/${blocker.identifier}/`);
  await expect(page.getByText("Nothing blocks this, and it blocks nothing.")).toBeVisible();

  await page.getByRole("button", { name: "Add a relation" }).click();

  // Scoped to the popover throughout: an identifier appears both in the picker
  // and on the rail's own remove control, so an unscoped match would be two
  // different buttons.
  const picker = page.getByRole("dialog");
  await picker.getByRole("button", { name: "Blocks", exact: true }).click();

  const search = picker.getByRole("textbox", { name: "Find an issue to relate" });
  await search.fill(blocker.identifier);
  // The issue itself is never a target — the service refuses it, and a row that
  // cannot be clicked for so obvious a reason is noise.
  await expect(picker.getByRole("button", { name: new RegExp(blocker.identifier) })).toHaveCount(0);

  await search.fill(blocked.identifier);
  await picker.getByRole("button", { name: new RegExp(blocked.identifier) }).click();

  await expect(page.getByText("Blocks", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: new RegExp(blocked.identifier) })).toBeVisible();

  // The other end, which is the same row read backwards.
  await page.goto(`/issue/${blocked.identifier}/`);
  await expect(page.getByText("Blocked by", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(blocker.identifier) })).toBeVisible();

  // And removing it from that end takes it off both.
  await page.getByRole("button", { name: `Remove the relation to ${blocker.identifier}` }).click();
  await expect(page.getByText("Nothing blocks this, and it blocks nothing.")).toBeVisible({ timeout: 15_000 });

  await page.goto(`/issue/${blocker.identifier}/`);
  await expect(page.getByText("Nothing blocks this, and it blocks nothing.")).toBeVisible();

  await archiveIssue(page, blocker.identifier);
  await archiveIssue(page, blocked.identifier);
});

test("offers an already-related issue as linked rather than hiding it", async ({ page }) => {
  const one = await createIssue(page, { projectKey: "IKN", title: `Relation dup A ${RUN}` });
  const two = await createIssue(page, { projectKey: "IKN", title: `Relation dup B ${RUN}` });

  await page.goto(`/issue/${one.identifier}/`);
  await page.getByRole("button", { name: "Add a relation" }).click();

  const picker = page.getByRole("dialog");
  await picker.getByRole("button", { name: "Related", exact: true }).click();
  await picker.getByRole("textbox", { name: "Find an issue to relate" }).fill(two.identifier);
  await picker.getByRole("button", { name: new RegExp(two.identifier) }).click();

  await expect(page.getByText("Related", { exact: true })).toBeVisible({ timeout: 15_000 });

  // Second time round it is still in the results, disabled and labelled — a
  // result that vanished would read as "not found" rather than "already done".
  await page.getByRole("button", { name: "Add a relation" }).click();
  await picker.getByRole("textbox", { name: "Find an issue to relate" }).fill(two.identifier);

  const target = picker.getByRole("button", { name: new RegExp(two.identifier) });
  await expect(target).toBeDisabled();
  await expect(target).toContainText("linked");

  await page.keyboard.press("Escape");
  await archiveIssue(page, one.identifier);
  await archiveIssue(page, two.identifier);
});

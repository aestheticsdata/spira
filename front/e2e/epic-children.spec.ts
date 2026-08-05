import { archiveIssue, createIssue, fetchIssues } from "@e2e/api";
import { expect, test } from "@playwright/test";

/**
 * The epic page (COS-279). The ticket's definition of done is that an epic and
 * its issues render with the correct ratio and that adding one updates the ring
 * immediately — so the ring is what every assertion here reads, rather than the
 * rows, because the ring is the claim.
 */
const RUN = String(Date.now()).slice(-4);

/** The ring names itself; the fraction beside it is only digits. */
const ring = (name: string) => ({ name, exact: true });

test.describe.configure({ mode: "serial" });

test("fills, counts and empties an epic", async ({ page }) => {
  const epic = await createIssue(page, { projectKey: "IKN", title: `Epic fixture ${RUN}`, isEpic: true });
  const loose = await createIssue(page, { projectKey: "IKN", title: `Loose fixture ${RUN}` });

  await page.goto(`/issue/${epic.identifier}/`);
  await expect(page.getByRole("img", ring("Empty epic"))).toBeVisible();

  // An empty epic opens its creator: the picker above it offers only issues
  // that already exist, so with none of those this is the way in.
  await page.getByRole("textbox", { name: `New issue title in ${epic.identifier}` }).fill(`Filed inside ${RUN}`);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("img", ring("0 of 1 issue completed"))).toBeVisible({ timeout: 15_000 });

  // The other half: an issue that exists and belongs to no epic yet.
  await page.getByRole("button", { name: "Add an existing issue to this epic" }).click();
  await page.getByRole("button", { name: `${loose.identifier} ${loose.title}` }).click();

  await expect(page.getByRole("img", ring("0 of 2 issues completed"))).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: new RegExp(loose.identifier) })).toBeVisible();

  // Out again. The control is revealed on hover, but it is in the row either
  // way — a keyboard never hovers anything.
  await page.getByRole("button", { name: `Take ${loose.identifier} out of this epic` }).click();
  await expect(page.getByRole("img", ring("0 of 1 issue completed"))).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: new RegExp(loose.identifier) })).toHaveCount(0);

  // The quick-add filed an issue whose identifier this spec never saw.
  for (const child of await fetchIssues(page, `epic=${epic.identifier}`)) {
    await archiveIssue(page, child.identifier);
  }
  await archiveIssue(page, loose.identifier);
  await archiveIssue(page, epic.identifier);
});

test("puts the epic in a contained issue's breadcrumb", async ({ page }) => {
  const epic = await createIssue(page, { projectKey: "IKN", title: `Epic parent ${RUN}`, isEpic: true });
  const child = await createIssue(page, {
    projectKey: "IKN",
    title: `Epic child ${RUN}`,
    epicId: epic.id,
  });

  await page.goto(`/issue/${child.identifier}/`);

  const crumb = page.getByRole("link", { name: `Epic ${epic.identifier} Epic parent ${RUN}` });
  await expect(crumb).toBeVisible();

  await crumb.click();
  await expect(page).toHaveURL(new RegExp(`/issue/${epic.identifier}`), { timeout: 15_000 });

  // Counted without anything having been added through the UI: the ratio is the
  // API's, not something the page adds up as it draws.
  await expect(page.getByRole("img", ring("0 of 1 issue completed"))).toBeVisible();

  await archiveIssue(page, child.identifier);
  await archiveIssue(page, epic.identifier);
});

import { archiveIssue, createIssue } from "@e2e/api";
import { expect, test } from "@playwright/test";

/**
 * Everything the properties panel writes (SPI-26) — the half of the app that
 * did not exist until now: an issue could be created and described, but never
 * moved, prioritised, labelled, reparented, renamed or archived.
 *
 * Each spec makes its own fixture through the API and archives it afterwards,
 * so the seeded Iknos rows are untouched and a rerun starts from the same list.
 */
const RUN = String(Date.now()).slice(-4);

test.describe.configure({ mode: "serial" });

test("the panel moves status, priority, labels and epic", async ({ page }) => {
  const issue = await createIssue(page, { projectKey: "IKN", title: `Panel fixture ${RUN}` });
  await page.goto(`/issue/${issue.identifier}/`);

  const status = page.getByRole("button", { name: "Status: change" });
  const priority = page.getByRole("button", { name: "Priority: change" });
  const labels = page.getByRole("button", { name: "Labels: change" });
  const epic = page.getByRole("button", { name: "Epic: change" });

  // Created with the API's defaults, which is what the panel should be showing.
  await expect(status).toContainText("Backlog");
  await expect(priority).toContainText("No priority");
  await expect(labels).toContainText("None");

  await status.click();
  await page.getByRole("button", { name: "In Progress", exact: true }).click();
  await expect(status).toContainText("In Progress", { timeout: 15_000 });

  await priority.click();
  await page.getByRole("button", { name: "Urgent", exact: true }).click();
  await expect(priority).toContainText("Urgent", { timeout: 15_000 });

  await labels.click();
  await page.getByRole("button", { name: "Feature", exact: true }).click();
  await expect(labels).toContainText("Feature", { timeout: 15_000 });
  // Labels is the one menu that stays open after a choice, so it has to be
  // dismissed before it stops covering the rows under it.
  await page.keyboard.press("Escape");

  // Iknos has one epic, IKN-1. Attaching to it is the round trip that proves
  // the parent chip above the description comes back too.
  await epic.click();
  await page.getByRole("button", { name: /^IKN-1 / }).click();
  await expect(epic).toContainText("IKN-1", { timeout: 15_000 });
  await expect(page.getByRole("link", { name: /IKN-1/ })).toBeVisible();

  // And back off it, which is the case a menu of epics alone cannot express.
  await epic.click();
  await page.getByRole("button", { name: "No epic", exact: true }).click();
  await expect(epic).toContainText("None", { timeout: 15_000 });

  await archiveIssue(page, issue.identifier);
});

test("the type toggle refuses, with the reason, while the issue belongs to an epic", async ({ page }) => {
  const epics = await createIssue(page, { projectKey: "IKN", title: `Type epic ${RUN}`, isEpic: true });
  const child = await createIssue(page, {
    projectKey: "IKN",
    title: `Type child ${RUN}`,
    epicId: epics.id,
  });

  await page.goto(`/issue/${child.identifier}/`);

  // Disabled with the service's own sentence attached, rather than accepting
  // the click and answering with a toast.
  const type = page.getByRole("button", { name: "Type: change" });
  await expect(type).toBeDisabled();
  await expect(type).toHaveAttribute("title", new RegExp(`belongs to epic ${epics.identifier}`));

  await archiveIssue(page, child.identifier);
  await archiveIssue(page, epics.identifier);
});

test("the title edits in place, and archive then restore round-trips", async ({ page }) => {
  const issue = await createIssue(page, { projectKey: "IKN", title: `Title fixture ${RUN}` });
  await page.goto(`/issue/${issue.identifier}/`);

  const renamed = `Title fixture ${RUN} renamed`;
  // The heading is the control: it stays an h1 so the page still says what it
  // is about, and clicking it opens the field.
  const heading = page.getByRole("heading", { level: 1 });

  await heading.click();
  const field = page.getByRole("textbox", { name: "Title" });
  await field.fill(renamed);
  await field.press("Enter");

  await expect(heading).toHaveText(renamed, { timeout: 15_000 });

  // Escape puts the original back rather than saving what was typed.
  await heading.click();
  await page.getByRole("textbox", { name: "Title" }).fill("Never saved");
  await page.getByRole("textbox", { name: "Title" }).press("Escape");
  await expect(heading).toHaveText(renamed);

  // Archiving leaves the page, because the issue is off every list it came from.
  await page.getByRole("button", { name: "Archive issue" }).click();
  await expect(page).toHaveURL(/\/ikn\/issues/, { timeout: 15_000 });
  await expect(page.locator("a").filter({ hasText: renamed })).toHaveCount(0);

  // The detail route still serves it, which is what makes the restore reachable.
  await page.goto(`/issue/${issue.identifier}/`);
  await expect(page.getByText("Archived.", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Restore issue" }).click();
  await expect(page.getByRole("button", { name: "Archive issue" })).toBeVisible({ timeout: 15_000 });

  await page.goto("/ikn/issues/");
  await expect(page.locator("a").filter({ hasText: renamed })).toHaveCount(1);

  await archiveIssue(page, issue.identifier);
});

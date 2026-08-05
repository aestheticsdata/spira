import { archiveIssue, createIssue, createLabel, deleteLabel, fetchStates } from "@e2e/api";
import { expect, test } from "@playwright/test";

/**
 * The filter bar (COS-277). The ticket's own definition of done is three
 * claims, and each is asserted here: several filters combine correctly, the URL
 * fully describes the list, and a reload restores it exactly.
 *
 * The reload is the one that matters. Filter state held anywhere but the URL
 * would survive a click and die on a refresh, and it is precisely a refresh
 * that a person does after leaving a filtered list open in a tab.
 */
const RUN = String(Date.now()).slice(-4);

/**
 * Anchored, because the trigger picks up a count once a filter is on ("Filter
 * 2") and because every chip's remove control ends in the word "filter" — an
 * unanchored substring would match both.
 */
const TRIGGER = /^Filter/;

test.describe.configure({ mode: "serial" });

test("combines filters, writes them to the URL, and survives a reload", async ({ page }) => {
  const states = await fetchStates(page);
  const backlog = states.find((state) => state.type === "backlog");
  expect(backlog, "the seed must provide a backlog state").toBeTruthy();

  const epic = await createIssue(page, { projectKey: "IKN", title: `Filter epic ${RUN}`, isEpic: true });
  const urgentInEpic = await createIssue(page, {
    projectKey: "IKN",
    title: `Filter urgent in epic ${RUN}`,
    priority: 1,
    epicId: epic.id,
    stateId: backlog?.id,
  });
  const lowNoEpic = await createIssue(page, {
    projectKey: "IKN",
    title: `Filter low no epic ${RUN}`,
    priority: 4,
    stateId: backlog?.id,
  });

  const urgentRow = page.getByRole("link", { name: new RegExp(urgentInEpic.identifier) });
  const lowRow = page.getByRole("link", { name: new RegExp(lowNoEpic.identifier) });

  await page.goto("/IKN/issues/");
  await expect(urgentRow).toBeVisible();
  await expect(lowRow).toBeVisible();

  // One filter: priority.
  await page.getByRole("button", { name: TRIGGER }).click();
  await page.getByRole("button", { name: "Priority", exact: true }).click();
  await page.getByRole("button", { name: "Urgent", exact: true }).click();
  await page.keyboard.press("Escape");

  await expect(urgentRow).toBeVisible({ timeout: 15_000 });
  await expect(lowRow).toHaveCount(0);
  await expect(page).toHaveURL(/priority=1/);

  // A second filter, and the two have to combine rather than replace. Asserted
  // on the fixtures rather than on an empty list: this project holds whatever
  // else the seed and other specs left behind, so "no rows at all" would be a
  // claim about the database instead of about the filters.
  await page.getByRole("button", { name: TRIGGER }).click();
  await page.getByRole("button", { name: "Epic", exact: true }).click();
  await page.getByRole("button", { name: "In no epic" }).click();

  await expect(page).toHaveURL(/hasEpic=false/, { timeout: 15_000 });
  await expect(page).toHaveURL(/priority=1/);
  // Urgent, but it sits in an epic; low, but it has none. Neither survives both.
  await expect(urgentRow).toHaveCount(0);
  await expect(lowRow).toHaveCount(0);

  // The URL is the whole state: a reload has nothing else to restore from.
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove the priority filter" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove the epic filter" })).toBeVisible();
  await expect(urgentRow).toHaveCount(0);

  // Dropping one chip leaves the other in force.
  await page.getByRole("button", { name: "Remove the epic filter" }).click();
  await expect(urgentRow).toBeVisible({ timeout: 15_000 });
  await expect(lowRow).toHaveCount(0);

  await page.getByRole("button", { name: "Clear" }).click();
  await expect(lowRow).toBeVisible({ timeout: 15_000 });
  await expect(page).not.toHaveURL(/priority=/);

  await archiveIssue(page, urgentInEpic.identifier);
  await archiveIssue(page, lowNoEpic.identifier);
  await archiveIssue(page, epic.identifier);
});

test("excludes a label instead of requiring it", async ({ page }) => {
  const label = await createLabel(page, `filter-${RUN}`);
  const tagged = await createIssue(page, {
    projectKey: "IKN",
    title: `Filter tagged ${RUN}`,
    labelIds: [label.id],
  });
  const untagged = await createIssue(page, { projectKey: "IKN", title: `Filter untagged ${RUN}` });

  const taggedRow = page.getByRole("link", { name: new RegExp(tagged.identifier) });
  const untaggedRow = page.getByRole("link", { name: new RegExp(untagged.identifier) });

  await page.goto("/IKN/issues/");
  await page.getByRole("button", { name: TRIGGER }).click();
  await page.getByRole("button", { name: "Label", exact: true }).click();

  // One click includes, a second excludes — the same row cycles rather than
  // needing a separate control for the negative case.
  const row = page.getByRole("button", { name: new RegExp(`^filter-${RUN} — `) });
  await row.click();
  await expect(page).toHaveURL(new RegExp(`label=${label.id}`), { timeout: 15_000 });

  await row.click();
  await expect(page).toHaveURL(new RegExp(`excludeLabel=${label.id}`), { timeout: 15_000 });
  await page.keyboard.press("Escape");

  await expect(untaggedRow).toBeVisible({ timeout: 15_000 });
  await expect(taggedRow).toHaveCount(0);

  await archiveIssue(page, tagged.identifier);
  await archiveIssue(page, untagged.identifier);
  await deleteLabel(page, label.id);
});

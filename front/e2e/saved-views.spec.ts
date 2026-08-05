import { archiveIssue, createIssue, createView, deleteView, fetchViews, postView } from "@e2e/api";
import { expect, test } from "@playwright/test";

/**
 * The saved views API (COS-265). The ticket's definition of done is a
 * round-trip — build a filter in the URL, save it, reload from the saved view,
 * and get an identical query string back — so that is what this drives, through
 * the real filter bar rather than through a hand-written query.
 *
 * There is no UI to save a view yet; that is COS-278. The saving and reading
 * here go through `page.request`, which is the same session the browser holds.
 */
const RUN = String(Date.now()).slice(-4);

const FILTER = /^Filter/;
const DISPLAY = /^Display/;

test.describe.configure({ mode: "serial" });

test("a filter built in the URL round-trips through a saved view", async ({ page }) => {
  const urgent = await createIssue(page, { projectKey: "IKN", title: `View urgent ${RUN}`, priority: 1 });
  const low = await createIssue(page, { projectKey: "IKN", title: `View low ${RUN}`, priority: 4 });

  await page.goto("/IKN/issues/");

  // Built by hand, exactly as an owner would: one filter and one display change.
  await page.getByRole("button", { name: FILTER }).click();
  await page.getByRole("button", { name: "Priority" }).click();
  await page.getByRole("button", { name: "Urgent" }).click();
  await expect(page).toHaveURL(/priority=1/, { timeout: 15_000 });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: DISPLAY }).click();
  await page.getByRole("button", { name: "Group by Priority" }).click();
  await expect(page).toHaveURL(/group=priority/, { timeout: 15_000 });
  await page.keyboard.press("Escape");

  const built = new URL(page.url()).search;
  const view = await createView(page, { name: `Round trip ${RUN}`, projectKey: "IKN", query: built });

  // Stored, not merely echoed: the round-trip has to survive the database.
  const [stored] = (await fetchViews(page, "IKN")).filter((entry) => entry.id === view.id);
  expect(stored.invalid).toBeNull();
  expect(stored.query).not.toBeNull();

  // The `?` is gone and the keys are alphabetical, but nothing was lost or
  // invented — canonical is a spelling, not a different view.
  const query = new URLSearchParams(stored.query as string);
  expect(query.get("priority")).toBe("1");
  expect(query.get("group")).toBe("priority");
  expect([...query.keys()].sort()).toEqual([...new URLSearchParams(built).keys()].sort());

  // Opening the view is pushing its query back into the URL, and the list that
  // comes up is the list that was saved: the urgent one, under its own header.
  await page.goto(`/IKN/issues/?${stored.query as string}`);

  await expect(page.getByRole("link", { name: new RegExp(urgent.identifier) })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(low.identifier) })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Urgent/ })).toBeVisible();
  // The bar reads the restored URL as its own, so the filter is editable rather
  // than merely applied — an opened view behaves like one built by hand.
  await expect(page.getByRole("button", { name: /^Remove the priority filter/ })).toBeVisible();

  await deleteView(page, view.id);
  await archiveIssue(page, urgent.identifier);
  await archiveIssue(page, low.identifier);
});

test("refuses a query it could not replay, rather than storing it", async ({ page }) => {
  await page.goto("/IKN/issues/");

  const refused = await postView(page, { name: `Bad ${RUN}`, projectKey: "IKN", query: "group=milestone" });
  expect(refused.status()).toBe(400);

  // `project` names the scope, which is a column — the query must not repeat it.
  const scoped = await postView(page, { name: `Bad ${RUN}`, projectKey: "IKN", query: "project=IKN" });
  expect(scoped.status()).toBe(400);

  // Nothing was written by either.
  expect((await fetchViews(page, "IKN")).filter((view) => view.name === `Bad ${RUN}`)).toHaveLength(0);
});

test("the plain list is a view worth saving", async ({ page }) => {
  const view = await createView(page, { name: `Everything ${RUN}`, query: "" });

  expect(view.query).toBe("");
  expect(view.invalid).toBeNull();
  // No project key: workspace-wide, which is the other half of the sidebar.
  expect(view.project).toBeNull();

  // A workspace view applies inside a project too, so it comes back scoped.
  expect((await fetchViews(page, "IKN")).map((entry) => entry.id)).toContain(view.id);

  await deleteView(page, view.id);
});

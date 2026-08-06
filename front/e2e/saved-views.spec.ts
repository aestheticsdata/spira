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

/* ------------------------------------------------------------- the UI (COS-278) */

test("saves from the bar, opens from the sidebar, and updates in place", async ({ page }) => {
  const urgent = await createIssue(page, { projectKey: "IKN", title: `Bar urgent ${RUN}`, priority: 1 });
  const low = await createIssue(page, { projectKey: "IKN", title: `Bar low ${RUN}`, priority: 4 });
  const name = `Bar view ${RUN}`;

  await page.goto("/IKN/issues/");
  await page.getByRole("button", { name: FILTER }).click();
  await page.getByRole("button", { name: "Priority" }).click();
  await page.getByRole("button", { name: "Urgent" }).click();
  await expect(page).toHaveURL(/priority=1/, { timeout: 15_000 });
  await page.keyboard.press("Escape");

  // The bar's control and the dialog's submit share a name, so the dialog is
  // reached as a dialog rather than by hoping the second match is the right one.
  await page.getByRole("button", { name: "Save view" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Save view" }).click();

  // Saved, and the URL now says which view is open.
  await expect(page).toHaveURL(/view=/, { timeout: 15_000 });
  await expect(page.getByRole("link", { name })).toBeVisible();

  // Editing inside a view offers to write the change back rather than only to
  // start another one.
  await page.getByRole("button", { name: /^Remove the priority filter/ }).click();
  await page.getByRole("button", { name: FILTER }).click();
  await page.getByRole("button", { name: "Priority" }).click();
  await page.getByRole("button", { name: "Low" }).click();
  await expect(page).toHaveURL(/priority=4/, { timeout: 15_000 });
  await page.keyboard.press("Escape");

  await expect(page.getByRole("button", { name: "Save as new" })).toBeVisible();
  await page.getByRole("button", { name: "Update view" }).click();
  // Written back: the offer to write it back is what goes away.
  await expect(page.getByRole("button", { name: "Update view" })).toHaveCount(0, { timeout: 15_000 });

  // Reached from the sidebar, from somewhere else entirely, it restores the
  // edited list — not the one it was first saved as.
  await page.goto("/projects/");
  await page.getByRole("link", { name }).click();

  await expect(page).toHaveURL(/priority=4/, { timeout: 15_000 });
  await expect(page.getByRole("link", { name: new RegExp(low.identifier) })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(urgent.identifier) })).toHaveCount(0);

  // Cleaned up through the page that exists to do it.
  await page.goto("/views/");
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await expect(page.getByRole("link", { name })).toHaveCount(0, { timeout: 15_000 });

  await archiveIssue(page, urgent.identifier);
  await archiveIssue(page, low.identifier);
});

test("a workspace view opens as a list spanning every project", async ({ page }) => {
  // Two projects, so the claim is proved rather than assumed: nothing in the
  // seed is Urgent, and a list that spans everything still shows nothing if
  // nothing matches.
  const here = await createIssue(page, { projectKey: "IKN", title: `Cross IKN ${RUN}`, priority: 1 });
  const there = await createIssue(page, { projectKey: "SPI", title: `Cross SPI ${RUN}`, priority: 1 });

  const view = await createView(page, { name: `Workspace ${RUN}`, query: "priority=1&group=project" });

  await page.goto(`/views/${view.id}/`);

  // The route carries the id; the query carries the list. Both, after the
  // redirect that puts the stored query back in the address bar.
  await expect(page).toHaveURL(/priority=1/, { timeout: 15_000 });
  await expect(page).toHaveURL(new RegExp(`view=${view.id}`));
  await expect(page.getByText(`Workspace ${RUN}`).first()).toBeVisible();

  // Two projects on one list — the first list in Spira that is not scoped to a
  // single one, and what makes grouping by project worth offering at all.
  await expect(page.getByRole("link", { name: new RegExp(here.identifier) })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(there.identifier) })).toBeVisible();
  await expect(page.getByRole("button", { name: /Iknos/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Spira/ })).toBeVisible();

  await deleteView(page, view.id);
  await archiveIssue(page, here.identifier);
  await archiveIssue(page, there.identifier);
});

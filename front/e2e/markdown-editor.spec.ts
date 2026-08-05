import { expect, test } from "@playwright/test";

/**
 * Writing, previewing and clearing a description (SPI-21).
 *
 * IKN-2 is seeded with no description, so the test writes one and clears it
 * again — clearing stores `null`, which is exactly what it found. Nothing is
 * left behind, unlike the project spec, where archiving is the only way out.
 */
const BODY = ["## Ingestion", "", "Ships behind SPI-24, which owns the renumbering.", "", "- ECS logs", "- Retention"].join(
  "\n",
);

test("writes a description, previews it live, then clears it", async ({ page }) => {
  await page.goto("/issue/IKN-2/");

  await expect(page.getByText("No description yet.")).toBeVisible();

  await page.getByRole("button", { name: "Write one" }).click();

  const textarea = page.getByRole("textbox");
  await expect(textarea).toBeFocused();

  const preview = page.locator("div").filter({ hasText: /^Nothing to preview yet\.$/ });
  await expect(preview).toBeVisible();

  await textarea.fill(BODY);

  // The preview is the real renderer: the heading is an h2, the list is a list,
  // and the reference resolves to a chip carrying the issue's own title — which
  // is the part a lookalike preview could not do.
  await expect(page.getByRole("heading", { name: "Ingestion", exact: true })).toBeVisible();
  await expect(page.getByText("M3 — Renumbering, legacy identifiers and redirects")).toBeVisible();

  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Ingestion", exact: true })).toBeVisible();
  await expect(page.getByText("No description yet.")).toHaveCount(0);

  // The saved view is server-rendered, so the chip is there without a client
  // request — same markup, resolved at build time.
  await expect(page.getByRole("link", { name: /SPI-24/ })).toBeVisible();

  // Put it back: an emptied editor clears the column rather than storing "".
  await page.getByRole("button", { name: "Edit description" }).click();
  await page.getByRole("textbox").fill("");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByText("No description yet.")).toBeVisible({ timeout: 15_000 });
});

test("escape abandons an edit without saving it", async ({ page }) => {
  await page.goto("/issue/IKN-3/");

  await page.getByRole("button", { name: "Write one" }).click();
  await page.getByRole("textbox").fill("This must never be stored.");
  await page.getByRole("textbox").press("Escape");

  await expect(page.getByText("No description yet.")).toBeVisible();

  await page.reload();
  await expect(page.getByText("No description yet.")).toBeVisible();
  await expect(page.getByText("This must never be stored.")).toHaveCount(0);
});

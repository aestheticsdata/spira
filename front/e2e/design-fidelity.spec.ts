import { expect, test } from "@playwright/test";

/**
 * Guards the type scale against the failure that produced it.
 *
 * The scale is named by literal size (`text-13`, `text-115`). tailwind-merge
 * does not know that scale unless `@lib/utils` tells it, and left to its
 * defaults it files `text-13` under text-*colour*, then deletes it as a
 * conflict whenever the same `cn()` call also gets a `text-ink-*` class. The
 * class disappears, the element silently falls back to the inherited 16px, and
 * the build stays green throughout — nothing type-checks or lints this.
 *
 * So it is asserted at runtime instead: no rendered text may sit on 16px, and
 * the load-bearing elements must measure what the design says.
 */

/**
 * Every rendered text node's own font-size, ignoring the icon font (sized
 * inline from the database) and non-visual tags.
 */
const strayDefaultSizes = `(() => {
  const strays = [];
  const walk = (element) => {
    for (const child of element.children) walk(child);
    if (["SCRIPT", "STYLE", "NEXT-ROUTE-ANNOUNCER"].includes(element.tagName)) return;
    if (element.classList.contains("ms")) return;
    const own = [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent.trim())
      .join("")
      .trim();
    if (own && parseFloat(getComputedStyle(element).fontSize) === 16) strays.push(own.slice(0, 40));
  };
  walk(document.body);
  return strays;
})()`;

for (const path of ["/projects/", "/spi/issues/", "/spi/overview/", "/issue/SPI-24/", "/settings/"]) {
  test(`no text falls back to the browser default on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    expect(await page.evaluate(strayDefaultSizes)).toEqual([]);
  });
}

test("the issues list matches the design's measurements", async ({ page }) => {
  await page.goto("/spi/issues/");
  await expect(page.locator("main")).toBeVisible();

  const measure = (selector: string) =>
    page.evaluate((sel) => {
      const element = document.querySelector(sel);
      if (!element) return null;
      return {
        font: parseFloat(getComputedStyle(element).fontSize),
        height: Math.round(element.getBoundingClientRect().height),
      };
    }, selector);

  // Literals from design_handoff_spira/spira-v3-neutral.html.
  expect(await measure("nav a[href='/spi/issues']")).toMatchObject({ font: 13, height: 30 });
  expect(await measure("main a[href='/issue/SPI-6'] > span.flex-1")).toMatchObject({ font: 13 });
  expect(await measure("main a[href='/issue/SPI-6']")).toMatchObject({ height: 36 });
  expect(await measure("main a[href='/issue/SPI-1']")).toMatchObject({ height: 42 });
  expect(await measure("main a[href='/issue/SPI-6'] span.identifier")).toMatchObject({ font: 11.5 });
});

import { expect, test, type Page } from '@playwright/test';
import { signInAsAdmin } from './helpers/testUsers';

/**
 * MYK9-1446: the Dogs and People lists hold one short line per row, so the list column must be
 * narrower than the open record's pane, on a fresh profile, with a divider bounded at 40%.
 * jsdom performs no layout, so only a browser can prove the rendered widths.
 *
 * Read-only: signs in as the shared e2e admin, opens the first row, measures, changes nothing.
 */
const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1074, height: 800 },
];

const CASES = [
  { path: '/dogs', list: 'Dog list', detail: 'Dog details', divider: /Resize Dog list/ },
  { path: '/people', list: 'People list', detail: 'Person details', divider: /Resize People list/ },
];

async function width(page: Page, name: string): Promise<number> {
  const box = await page.getByRole('region', { name }).boundingBox();
  if (!box) throw new Error(`${name} has no box`);
  return box.width;
}

for (const viewport of VIEWPORTS) {
  for (const c of CASES) {
    test(`${c.path} list is narrower than its details at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await signInAsAdmin(page);
      // A fresh layout, not a fresh session: clear saved panel sizes but keep the `sb-` auth token.
      await page.evaluate(() => {
        for (const key of Object.keys(window.localStorage)) {
          if (!key.startsWith('sb-')) window.localStorage.removeItem(key);
        }
      });
      await page.goto(c.path);
      await page
        .getByRole('link', { name: /./ })
        .and(page.locator(`a[href^="${c.path}/"]`))
        .first()
        .click();
      await expect(page.getByRole('region', { name: c.detail })).toBeVisible();

      const listWidth = await width(page, c.list);
      const detailWidth = await width(page, c.detail);
      expect(listWidth, `list ${listWidth}px vs details ${detailWidth}px`).toBeLessThan(
        detailWidth
      );

      const divider = page.getByRole('separator', { name: c.divider });
      await expect(divider).toHaveAttribute('aria-valuemax', '40');
      await expect(divider).toHaveAttribute('aria-valuemin', '22');
      const now = Number(await divider.getAttribute('aria-valuenow'));
      expect(now).toBeGreaterThanOrEqual(22);
      expect(now).toBeLessThanOrEqual(40);
    });
  }
}

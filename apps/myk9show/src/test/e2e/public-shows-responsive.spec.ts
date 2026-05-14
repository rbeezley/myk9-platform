import { expect, test } from '@playwright/test';

test.describe('Public Shows Responsive Smoke', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('renders the public shows page without mobile overflow', async ({ page }) => {
    await page.goto('/shows');

    await expect(page).toHaveURL(/\/shows/);
    await expect(page.getByRole('heading', { name: 'Shows' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByPlaceholder(/search shows/i)).toBeVisible();

    const tabList = page.getByRole('tablist');
    await expect(tabList).toBeVisible();
    await expect(tabList).toHaveCSS('overflow-x', 'auto');

    const bodyWidth = await page.locator('body').evaluate(body => body.scrollWidth);
    const viewportWidth = page.viewportSize()?.width ?? 375;
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);
  });

  test('keeps public browse controls touch-friendly on mobile', async ({ page }) => {
    await page.goto('/shows');

    await expect(page.getByRole('heading', { name: 'Shows' })).toBeVisible({ timeout: 15000 });

    const firstTab = page.getByRole('tab').first();
    const firstTabBox = await firstTab.boundingBox();
    expect(firstTabBox?.height).toBeGreaterThanOrEqual(44);

    const cardsViewButton = page.getByRole('button', { name: /cards view/i });
    const cardsViewBox = await cardsViewButton.boundingBox();
    expect(cardsViewBox?.height).toBeGreaterThanOrEqual(32);
    expect(cardsViewBox?.width).toBeGreaterThanOrEqual(32);
  });
});

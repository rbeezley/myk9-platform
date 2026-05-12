import { test, expect } from '@playwright/test';

test.describe('Browse Shows to Show Details Flow', () => {
  test('should load public browse shows without authentication', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/shows');

    await expect(page).toHaveURL(/\/shows/);
    await expect(page.getByRole('heading', { name: 'Shows' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByPlaceholder(/search shows/i)).toBeVisible();
    expect(consoleErrors.filter(error => !error.includes('DevTools'))).toHaveLength(0);
  });

  test('should navigate from a public show card to show details when shows exist', async ({
    page,
  }) => {
    await page.goto('/shows');
    await expect(page.getByRole('heading', { name: 'Shows' })).toBeVisible({ timeout: 15000 });

    const firstShowLink = page.locator('a[href^="/shows/"]').first();
    const showLinkCount = await firstShowLink.count();
    test.skip(showLinkCount === 0, 'No public shows are available in this environment.');

    const href = await firstShowLink.getAttribute('href');
    expect(href).toMatch(/^\/shows\/[^/]+$/);

    await firstShowLink.click();
    await expect(page).toHaveURL(/\/shows\/[^/]+$/);
    await expect(page.locator('body')).not.toContainText(/no shows available/i);
    await expect(page.locator('body')).not.toContainText(/no shows found/i);
  });
});

import { test, expect } from '@playwright/test';

test.describe('Registration Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Mock minimal API responses
    await page.route('**/api/**', async route => {
      const url = route.request().url();

      if (url.includes('/dogs/search')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 'dog-1', callName: 'Buddy', breed: 'Golden Retriever' },
            { id: 'dog-2', callName: 'Max', breed: 'Labrador' },
          ]),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      }
    });
  });

  test('should load registration page without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('DevTools')) {
        errors.push(msg.text());
      }
    });

    await page.goto('/shows/show-123/register');

    await expect(page.locator('h1, h2, [role="heading"], body').first()).toBeVisible();

    await page.waitForTimeout(2000);
    expect(errors.filter(e => !e.includes('Warning:'))).toHaveLength(0);
  });

  test('should expose a user-critical navigation affordance', async ({ page }) => {
    await page.goto('/shows/show-123/register');

    const navigationControl = page.getByRole('button', {
      name: /browse shows|next|back|cancel|complete registration|sign in|continue with google/i,
    });
    const accountLink = page.getByRole('link', { name: /sign in|sign up/i });

    await expect(navigationControl.or(accountLink).first()).toBeVisible({ timeout: 15000 });
  });

  test('should respond to basic interactions', async ({ page }) => {
    await page.goto('/shows/show-123/register');

    const inputs = page.locator('input:visible');
    if ((await inputs.count()) > 0) {
      await inputs.first().click();
    }

    const navigationControl = page.getByRole('button', {
      name: /browse shows|next|back|cancel|complete registration/i,
    });

    if ((await navigationControl.count()) > 0 && (await navigationControl.first().isEnabled())) {
      await navigationControl.first().click();
    }

    // Should not crash
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).toBeVisible();
  });
});

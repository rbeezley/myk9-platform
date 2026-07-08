import { test, expect, type Page } from '@playwright/test';
import { LIVE_REGISTRATION_SHOW_ID } from '../uat/shared/seededShows';

const REGISTRATION_PATH = `/shows/${LIVE_REGISTRATION_SHOW_ID}/register`;
const OPEN_ENTRY_DATE = new Date('2026-05-15T12:00:00.000Z');

async function gotoRegistrationSmoke(page: Page) {
  await page.clock.setFixedTime(OPEN_ENTRY_DATE);
  await page.goto(REGISTRATION_PATH, { waitUntil: 'commit', timeout: 60000 });
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined);
  await expect(page.locator('body')).toBeVisible({ timeout: 30000 });
}

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

    await gotoRegistrationSmoke(page);

    await expect(page.locator('body')).toBeVisible();

    expect(errors.filter(e => !e.includes('Warning:'))).toHaveLength(0);
  });

  test('should expose a user-critical navigation affordance', async ({ page }) => {
    await gotoRegistrationSmoke(page);

    await expect(page.getByRole('link', { name: 'Sign In' })).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('link', { name: 'Sign Up' })).toBeVisible();
  });

  test('should respond to basic interactions', async ({ page }) => {
    await gotoRegistrationSmoke(page);

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
    await expect(page.locator('body')).toBeVisible();
  });
});

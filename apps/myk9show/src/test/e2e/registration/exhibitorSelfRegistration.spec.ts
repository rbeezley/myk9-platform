import { test, expect, type Page } from '@playwright/test';

const EXHIBITOR_EMAIL = 'exhibitor1@myk9t.com';
const EXHIBITOR_PASSWORD = 'TestPass4567!';
const SHOW_ID = '4584f257-19b5-4016-aae6-5e7827b769cb';

async function signInAsExhibitor(page: Page) {
  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  await page.getByTestId('email-input').fill(EXHIBITOR_EMAIL);
  await page.getByTestId('password-input').fill(EXHIBITOR_PASSWORD);
  await page.getByTestId('sign-in-button').click();
  await page.waitForURL(url => !url.pathname.includes('/sign-in'), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

test('shows the current exhibitor self-registration placeholder', async ({ page }) => {
  await signInAsExhibitor(page);
  await page.goto(`/shows/${SHOW_ID}/register`, { waitUntil: 'networkidle' });

  await expect(page.getByRole('heading', { name: 'Show Registration' })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText(/Online show entry is coming soon/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Register for Show' })).not.toBeVisible();
});

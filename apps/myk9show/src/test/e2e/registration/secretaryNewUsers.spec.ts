import { test, expect, type Page } from '@playwright/test';

const SECRETARY_EMAIL = 'secretary@myk9t.com';
const SECRETARY_PASSWORD = 'TestPass4567!';
const SHOW_ID = '4584f257-19b5-4016-aae6-5e7827b769cb';

async function signInAsSecretary(page: Page) {
  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  await page.getByTestId('email-input').fill(SECRETARY_EMAIL);
  await page.getByTestId('password-input').fill(SECRETARY_PASSWORD);
  await page.getByTestId('sign-in-button').click();
  await page.waitForURL(url => !url.pathname.includes('/sign-in'), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

test('documents current secretary new-user creation availability', async ({ page }) => {
  await signInAsSecretary(page);
  await page.goto(`/secretary/register/${SHOW_ID}`, { waitUntil: 'networkidle' });

  await expect(page.getByRole('heading', { name: 'Register for Show' })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole('heading', { name: 'Select Dogs to Register' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Create New/i })).not.toBeVisible();
});

import { test, expect } from '@playwright/test';
import { SECRETARY_USER, signIn } from './uat/shared/auth';

test.describe('Basic Connectivity Test', () => {
  test('should load home page without authentication', async ({ page }) => {
    console.log('1. Navigating to home page...');
    await page.goto('/', { waitUntil: 'commit' });

    console.log('3. Checking page title...');
    await expect(page).toHaveTitle(/myK9Show/);

    console.log('4. Checking for public discovery link...');
    await expect(page.getByRole('link', { name: 'Browse shows' })).toBeVisible({
      timeout: 30000,
    });

    console.log('5. Test completed successfully!');
  });

  test('should sign in with secretary credentials', async ({ page }) => {
    console.log('1. Signing in with shared auth helper...');
    await signIn(page, SECRETARY_USER.email, SECRETARY_USER.password, '/secretary/dashboard');

    console.log('7. Verifying we are on the secretary dashboard...');
    await expect(page).toHaveTitle(/myK9Show/);
    await expect(page).toHaveURL(/\/secretary\/dashboard/);

    console.log('8. Authentication test completed successfully!');
  });
});

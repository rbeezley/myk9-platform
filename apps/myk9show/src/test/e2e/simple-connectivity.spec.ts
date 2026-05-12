import { test, expect } from '@playwright/test';
import { SECRETARY_USER } from './uat/shared/auth';

test.describe('Basic Connectivity Test', () => {
  test('should load home page without authentication', async ({ page }) => {
    console.log('1. Navigating to home page...');
    await page.goto('/', { timeout: 15000 });

    console.log('2. Waiting for page to load...');
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    console.log('3. Checking page title...');
    await expect(page).toHaveTitle(/myK9Show/);

    console.log('4. Checking for myK9Show heading...');
    await expect(page.locator('text=myK9Show').first()).toBeVisible({ timeout: 10000 });

    console.log('5. Test completed successfully!');
  });

  test('should sign in with secretary credentials', async ({ page }) => {
    console.log('1. Navigating to sign-in page...');
    await page.goto('/sign-in?returnTo=/secretary/dashboard', { timeout: 15000 });

    console.log('2. Checking for form elements...');
    await expect(page.locator('[data-testid="email-input"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="password-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="sign-in-button"]')).toBeVisible();

    console.log('3. Filling form...');
    await page.fill('[data-testid="email-input"]', SECRETARY_USER.email);
    await page.fill('[data-testid="password-input"]', SECRETARY_USER.password);

    console.log('4. Clicking sign in...');
    await page.click('[data-testid="sign-in-button"]');

    console.log('5. Waiting for navigation...');
    await page.waitForURL(/\/secretary\/dashboard/, { timeout: 15000 });

    console.log('6. Verifying we are on the secretary dashboard...');
    await expect(page).toHaveTitle(/myK9Show/);
    await expect(page).toHaveURL(/\/secretary\/dashboard/);

    console.log('7. Authentication test completed successfully!');
  });
});

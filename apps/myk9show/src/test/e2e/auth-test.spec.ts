import { test, expect } from '@playwright/test';
import { signIn, TEST_USERS } from './helpers/testUsers';

/**
 * Simple authentication test to verify the login flow works correctly
 * This test validates that the shared signIn() helper drives the real
 * SmartSignInPage two-step flow.
 */

test.describe('Authentication Flow Test', () => {
  test('should successfully login and redirect to home page', async ({ page }) => {
    // Drive the real SmartSignInPage flow via the shared helper with an
    // env-backed canonical account.
    await signIn(page, TEST_USERS.SITE_ADMIN.email, TEST_USERS.SITE_ADMIN.password);

    // Verify we landed on the home page and are no longer on sign-in.
    await expect(page).toHaveURL('/');
    await expect(page).not.toHaveURL('/sign-in');
  });

  test('should handle invalid credentials gracefully', async ({ page }) => {
    // Navigate to sign-in page
    await page.goto('/sign-in', { waitUntil: 'networkidle' });

    // Drive the two-step flow: an email reveals the password step, then a bad
    // password fails and keeps us on /sign-in.
    await page.fill('[data-testid="credential-input"]', 'invalid@example.com');
    await page.click('[data-testid="continue-button"]');
    await expect(page.locator('[data-testid="password-input"]')).toBeVisible();
    await page.fill('[data-testid="password-input"]', 'wrongpassword');
    await page.click('[data-testid="sign-in-button"]');

    // Should stay on sign-in page and show an error
    await expect(page).toHaveURL('/sign-in');
    await expect(page.locator('.text-destructive')).toBeVisible();
  });
});
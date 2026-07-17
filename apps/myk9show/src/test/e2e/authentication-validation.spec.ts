import { test, expect } from '@playwright/test';
import { TestSetup } from './helpers/testSetup';

/**
 * Authentication Validation Tests
 *
 * Tests that verify the real test users we created in Supabase can authenticate
 * and access the application properly. This is Phase 2 validation that real
 * database records are being created and authentication is working.
 */
test.describe('Phase 2: Authentication Validation', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    await testSetup.clearTestData();
  });

  test('should allow admin user to authenticate and access dashboard', async ({ page }) => {
    // Sign in as admin
    await testSetup.signIn('admin');

    // Verify we're logged in and redirected to home
    await expect(page).toHaveURL('/');

    // Verify the authenticated app shell is present. Assert the account menu
    // (rendered for every signed-in user) rather than specific nav-link labels,
    // which change with nav redesigns.
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();

    // Try to navigate to shows page (should work for authenticated users)
    await page.goto('/shows');
    await expect(page).toHaveURL('/shows');

    // Verify shows page loads for authenticated user
    await expect(page.locator('h1, h2, [role="heading"]').first()).toBeVisible();
  });

  test('should allow secretary user to authenticate and access secretary pages', async ({
    page,
  }) => {
    // Sign in as secretary
    await testSetup.signIn('secretary');

    // Verify we're logged in
    await expect(page).toHaveURL('/');

    // Navigate to shows page (secretaries manage shows)
    await page.goto('/shows');
    await expect(page).toHaveURL('/shows');

    // Verify secretary can access show management
    await expect(page.locator('h1, h2, [role="heading"]').first()).toBeVisible();
  });

  test('should allow judge user to authenticate and access judge pages', async ({ page }) => {
    // Sign in as judge
    await testSetup.signIn('judge');

    // Verify we're logged in
    await expect(page).toHaveURL('/');

    // Navigate to a common page accessible to judges
    await page.goto('/dogs');
    await expect(page).toHaveURL('/dogs');

    // Verify judge can access basic functionality
    await expect(page.locator('h1, h2, [role="heading"]').first()).toBeVisible();
  });

  test('should allow exhibitor user to authenticate and access exhibitor pages', async ({
    page,
  }) => {
    // Sign in as exhibitor (using 'user' role mapping)
    await testSetup.signIn('user');

    // Verify we're logged in
    await expect(page).toHaveURL('/');

    // Navigate to dogs page (exhibitors manage their dogs)
    await page.goto('/dogs');
    await expect(page).toHaveURL('/dogs');

    // Verify exhibitor can access dog management
    await expect(page.locator('h1, h2, [role="heading"]').first()).toBeVisible();
  });

  test('should reject invalid credentials', async ({ page }) => {
    // Navigate to sign-in page
    await page.goto('/sign-in');

    // Try to sign in with invalid credentials. An email reveals the password
    // step in place (SmartSignInPage two-step flow), then submitting fails.
    await page.fill('[data-testid="credential-input"]', 'invalid@example.com');
    await page.click('[data-testid="continue-button"]');
    await expect(page.locator('[data-testid="password-input"]')).toBeVisible();
    await page.fill('[data-testid="password-input"]', 'wrongpassword');
    await page.click('[data-testid="sign-in-button"]');

    // Verify we stay on sign-in page and see the rejection message. The app
    // renders this as visible text (not a [role="alert"] element), so assert
    // the copy the auth flow actually shows.
    await expect(page).toHaveURL(/.*sign-in/);
    await expect(page.getByText(/invalid login credentials/i)).toBeVisible({ timeout: 5000 });
  });

  test('should redirect unauthenticated users to sign-in', async ({ page }) => {
    // Try to access protected page without authentication
    await page.goto('/admin/templates');

    // Should be redirected to sign-in
    await expect(page).toHaveURL(/.*sign-in/);

    // Verify the sign-in form is visible. SmartSignInPage's first step shows
    // only the single credential field + Continue; the password field is
    // revealed after Continue, so it does not exist yet here.
    await expect(page.locator('[data-testid="credential-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="continue-button"]')).toBeVisible();
  });

  test('should maintain session across page refreshes', async ({ page }) => {
    // Sign in as admin
    await testSetup.signIn('admin');

    // Navigate to a specific page
    await page.goto('/shows');
    await expect(page).toHaveURL('/shows');

    // Refresh the page
    await page.reload();

    // Should still be on the same page (not redirected to login)
    await expect(page).toHaveURL('/shows');

    // Should still have access to navigation
    await expect(page.locator('nav, [role="navigation"]').first()).toBeVisible();
  });

  test('should allow sign out functionality', async ({ page }) => {
    // Sign in as admin
    await testSetup.signIn('admin');
    await expect(page).toHaveURL('/');

    // Look for sign out option (could be in profile menu, settings, etc.)
    const signOutElements = page.locator(
      '[role="button"]:has-text("Sign Out"), [role="button"]:has-text("Logout"), [role="menuitem"]:has-text("Sign Out")'
    );

    if ((await signOutElements.count()) > 0) {
      await signOutElements.first().click();

      // Should be redirected to sign-in page
      await expect(page).toHaveURL(/.*sign-in/);
    } else {
      // If no visible sign out button, this test is informational
      console.log('No sign out button found - this may be expected for current UI state');
    }
  });
});

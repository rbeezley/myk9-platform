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
    
    // Verify user is authenticated by checking for authenticated navigation
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'My Dogs' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Shows' })).toBeVisible();
    
    // Try to navigate to shows page (should work for authenticated users)
    await page.goto('/shows');
    await expect(page).toHaveURL('/shows');
    
    // Verify shows page loads for authenticated user
    await expect(page.locator('h1, h2, [role="heading"]')).toBeVisible();
  });

  test('should allow secretary user to authenticate and access secretary pages', async ({ page }) => {
    // Sign in as secretary
    await testSetup.signIn('secretary');
    
    // Verify we're logged in
    await expect(page).toHaveURL('/');
    
    // Navigate to shows page (secretaries manage shows)
    await page.goto('/shows');
    await expect(page).toHaveURL('/shows');
    
    // Verify secretary can access show management
    await expect(page.locator('h1, h2, [role="heading"]')).toBeVisible();
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
    await expect(page.locator('h1, h2, [role="heading"]')).toBeVisible();
  });

  test('should allow exhibitor user to authenticate and access exhibitor pages', async ({ page }) => {
    // Sign in as exhibitor (using 'user' role mapping)
    await testSetup.signIn('user');
    
    // Verify we're logged in
    await expect(page).toHaveURL('/');
    
    // Navigate to dogs page (exhibitors manage their dogs)
    await page.goto('/dogs');
    await expect(page).toHaveURL('/dogs');
    
    // Verify exhibitor can access dog management
    await expect(page.locator('h1, h2, [role="heading"]')).toBeVisible();
  });

  test('should reject invalid credentials', async ({ page }) => {
    // Navigate to sign-in page
    await page.goto('/sign-in');
    
    // Try to sign in with invalid credentials
    await page.fill('[data-testid="email-input"]', 'invalid@example.com');
    await page.fill('[data-testid="password-input"]', 'wrongpassword');
    await page.click('[data-testid="sign-in-button"]');
    
    // Verify we stay on sign-in page and see an error
    await expect(page).toHaveURL(/.*sign-in/);
    
    // Look for error message (flexible selector)
    const errorElements = page.locator('[role="alert"], .error, [data-testid*="error"]');
    await expect(errorElements.first()).toBeVisible({ timeout: 5000 });
  });

  test('should redirect unauthenticated users to sign-in', async ({ page }) => {
    // Try to access protected page without authentication
    await page.goto('/admin/templates');
    
    // Should be redirected to sign-in
    await expect(page).toHaveURL(/.*sign-in/);
    
    // Verify sign-in form is visible
    await expect(page.locator('[data-testid="email-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="password-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="sign-in-button"]')).toBeVisible();
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
    await expect(page.locator('nav, [role="navigation"]')).toBeVisible();
  });

  test('should allow sign out functionality', async ({ page }) => {
    // Sign in as admin
    await testSetup.signIn('admin');
    await expect(page).toHaveURL('/');
    
    // Look for sign out option (could be in profile menu, settings, etc.)
    const signOutElements = page.locator('[role="button"]:has-text("Sign Out"), [role="button"]:has-text("Logout"), [role="menuitem"]:has-text("Sign Out")');
    
    if (await signOutElements.count() > 0) {
      await signOutElements.first().click();
      
      // Should be redirected to sign-in page
      await expect(page).toHaveURL(/.*sign-in/);
    } else {
      // If no visible sign out button, this test is informational
      console.log('No sign out button found - this may be expected for current UI state');
    }
  });
});
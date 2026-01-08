import { test, expect } from '@playwright/test';

/**
 * Simple authentication test to verify the login flow works correctly
 * This test validates that the TestSetup.signIn() fixes are working
 */

test.describe('Authentication Flow Test', () => {
  test('should successfully login and redirect to home page', async ({ page }) => {
    console.log('Testing authentication flow...');
    
    // Navigate to sign-in page
    await page.goto('/sign-in', { waitUntil: 'networkidle' });
    
    // Ensure all form elements are visible
    await page.waitForSelector('[data-testid="email-input"]', { state: 'visible' });
    await page.waitForSelector('[data-testid="password-input"]', { state: 'visible' });
    await page.waitForSelector('[data-testid="sign-in-button"]', { state: 'visible' });
    
    // Fill in test credentials (these should exist in your test database)
    await page.fill('[data-testid="email-input"]', 'testadmin@example.com');
    await page.fill('[data-testid="password-input"]', 'Test123!');
    
    // Click sign in button
    await page.click('[data-testid="sign-in-button"]');
    
    // Wait for navigation to home page after successful login
    await page.waitForURL('/', { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    
    // Verify we're on the home page and signed in
    await expect(page).toHaveURL('/');
    
    // Look for some indication that we're signed in (this will depend on your app's UI)
    // You might need to adjust this based on what elements appear when logged in
    await expect(page).not.toHaveURL('/sign-in');
    
    console.log('Authentication test passed!');
  });

  test('should handle invalid credentials gracefully', async ({ page }) => {
    console.log('Testing invalid credentials...');
    
    // Navigate to sign-in page
    await page.goto('/sign-in', { waitUntil: 'networkidle' });
    
    // Fill in invalid credentials
    await page.fill('[data-testid="email-input"]', 'invalid@example.com');
    await page.fill('[data-testid="password-input"]', 'wrongpassword');
    
    // Click sign in button
    await page.click('[data-testid="sign-in-button"]');
    
    // Should stay on sign-in page and show an error
    await expect(page).toHaveURL('/sign-in');
    
    // Look for error message (adjust selector based on your error UI)
    await expect(page.locator('.text-destructive')).toBeVisible();
    
    console.log('Invalid credentials test passed!');
  });
});
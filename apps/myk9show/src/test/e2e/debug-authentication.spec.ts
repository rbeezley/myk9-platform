import { test, expect } from '@playwright/test';

/**
 * Debug Authentication Test
 * 
 * Simple test to debug what's happening during authentication
 */
test.describe('Debug Authentication', () => {
  
  test('debug login process step by step', async ({ page }) => {
    // Enable console logging
    page.on('console', msg => console.log('CONSOLE:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    
    // Navigate to sign-in page
    console.log('1. Navigating to sign-in page...');
    await page.goto('/sign-in');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot before
    await page.screenshot({ path: 'debug-before-login.png' });
    
    // Check what elements are available
    console.log('2. Checking form elements...');
    const emailInput = page.locator('[data-testid="email-input"]');
    const passwordInput = page.locator('[data-testid="password-input"]');
    const signInButton = page.locator('[data-testid="sign-in-button"]');
    
    await expect(emailInput).toBeVisible({ timeout: 10000 });
    await expect(passwordInput).toBeVisible();
    await expect(signInButton).toBeVisible();
    
    // Fill form
    console.log('3. Filling form with test credentials...');
    await emailInput.fill('working-admin@example.com');
    await passwordInput.fill('testpass123');
    
    // Take screenshot after filling
    await page.screenshot({ path: 'debug-after-filling.png' });
    
    // Click sign in and watch network
    console.log('4. Clicking sign in button...');
    
    // Listen for network requests
    page.on('request', req => {
      if (req.url().includes('auth') || req.url().includes('login') || req.url().includes('sign')) {
        console.log('AUTH REQUEST:', req.method(), req.url());
      }
    });
    
    page.on('response', res => {
      if (res.url().includes('auth') || res.url().includes('login') || res.url().includes('sign')) {
        console.log('AUTH RESPONSE:', res.status(), res.url());
      }
    });
    
    await signInButton.click();
    
    // Wait a bit to see what happens
    await page.waitForTimeout(5000);
    
    // Take screenshot after click
    await page.screenshot({ path: 'debug-after-click.png' });
    
    // Check current URL
    console.log('5. Current URL:', page.url());
    
    // Check for any error messages
    const errorMessages = page.locator('[role="alert"], .error, [data-testid*="error"]');
    const invalidTextErrors = page.locator('text="Invalid"');
    const errorCount = await errorMessages.count();
    const invalidTextCount = await invalidTextErrors.count();
    console.log('6. Error messages found:', errorCount);
    console.log('7. Invalid text errors found:', invalidTextCount);
    
    if (errorCount > 0) {
      for (let i = 0; i < errorCount; i++) {
        const errorText = await errorMessages.nth(i).textContent();
        console.log(`   Error ${i + 1}: ${errorText}`);
      }
    }
    
    if (invalidTextCount > 0) {
      for (let i = 0; i < invalidTextCount; i++) {
        const errorText = await invalidTextErrors.nth(i).textContent();
        console.log(`   Invalid text ${i + 1}: ${errorText}`);
      }
    }
    
    // Check if we're still on sign-in or redirected
    if (page.url().includes('sign-in')) {
      console.log('7. Still on sign-in page - login failed');
    } else {
      console.log('7. Redirected - login may have succeeded');
    }
  });
});
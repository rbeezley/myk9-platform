import { test, expect } from '@playwright/test';

test('Debug role assignment for testsecretary@example.com', async ({ page }) => {
  // Enable browser console logs with better filtering
  page.on('console', async (msg) => {
    const text = msg.text();
    if (msg.type() === 'log' && text.includes('DEBUG AuthContext')) {
      console.log('🔍 BROWSER DEBUG:', text);
    } else if (msg.type() === 'error') {
      console.error('❌ BROWSER ERROR:', text);
    }
  });

  console.log('🚀 Starting role assignment debug test...');

  // Navigate directly to the sign-in page
  await page.goto('http://localhost:5176/sign-in');
  
  // Wait for the page to load
  await page.waitForLoadState('networkidle');

  // Take a screenshot of the sign-in page
  await page.screenshot({ path: 'debug-signin-page.png', fullPage: true });

  // Look for the email input specifically
  const emailInput = page.locator('input[type="email"], input[name="email"]');
  const passwordInput = page.locator('input[type="password"], input[name="password"]');
  
  await expect(emailInput).toBeVisible({ timeout: 10000 });
  await expect(passwordInput).toBeVisible({ timeout: 10000 });

  console.log('✅ Login form found, attempting to log in...');
  
  // Fill in the test credentials
  await emailInput.fill('testsecretary@example.com');
  await passwordInput.fill('TestSecretary123!');
  
  // Take a screenshot after filling the form
  await page.screenshot({ path: 'debug-filled-form.png', fullPage: true });
  
  // Submit the form
  const submitButton = page.locator('button[type="submit"], button:has-text("Sign In")');
  await submitButton.click();
  
  console.log('📤 Login form submitted, waiting for response...');
  
  // Wait for navigation after login - give it more time
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000); // Wait for auth context updates
  
  // Take a screenshot after login attempt
  await page.screenshot({ path: 'debug-after-login.png', fullPage: true });

  // Check the current URL to see where we ended up
  const currentUrl = page.url();
  console.log('🌐 Current URL after login:', currentUrl);

  // Check if we're still on the sign-in page (login failed)
  if (currentUrl.includes('/sign-in')) {
    console.log('❌ Still on sign-in page, login may have failed');
    
    // Check for error messages
    const errorMessages = await page.locator('[class*="error"], [data-testid*="error"], .text-red-500, .text-destructive').count();
    if (errorMessages > 0) {
      const errorText = await page.locator('[class*="error"], [data-testid*="error"], .text-red-500, .text-destructive').first().textContent();
      console.log('❌ Error message found:', errorText);
    }
  } else {
    console.log('✅ Successfully navigated away from sign-in page');
  }

  // Wait longer for all auth context updates to complete
  await page.waitForTimeout(5000);

  // Check console logs captured so far
  console.log('🔍 Checking for browser console DEBUG messages above...');
  
  // Take final screenshot
  await page.screenshot({ path: 'debug-final-state.png', fullPage: true });

  // Check if we can find any role-related elements or navigation
  const navItems = await page.locator('nav a, [role="navigation"] a').count();
  console.log(`📍 Navigation items found: ${navItems}`);

  // Check for specific admin/secretary navigation
  const adminLinks = await page.locator('a[href*="admin"], button:has-text("Admin")').count();
  const secretaryLinks = await page.locator('a[href*="secretary"], button:has-text("Secretary")').count();
  
  console.log(`👑 Admin links found: ${adminLinks}`);
  console.log(`📋 Secretary links found: ${secretaryLinks}`);

  // Check for user profile/dropdown
  const userProfile = await page.locator('[data-testid*="user"], [data-testid*="profile"], button:has-text("@")').count();
  console.log(`👤 User profile elements found: ${userProfile}`);

  // Keep the browser open for manual inspection
  console.log('⏳ Keeping browser open for inspection...');
  await page.waitForTimeout(10000);
});
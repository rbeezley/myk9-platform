import { test, expect } from '@playwright/test';

// Test user credentials for real authentication
const TEST_USER = {
  email: 'test@playwright.com',
  password: 'TestUser123!'
};

test.describe('Browse Shows with Real Authentication', () => {
  test.beforeEach(async () => {
    // Start each test fresh
    console.log('🔄 Starting fresh test session');
  });

  test('should authenticate and browse shows successfully', async ({ page }) => {
    // Monitor console messages
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      consoleLogs.push(`${msg.type()}: ${msg.text()}`);
    });

    console.log('🔒 Navigating to protected Browse Shows page');
    // Step 1: Navigate to protected Browse Shows page (should redirect to sign-in)
    await page.goto('http://127.0.0.1:5174/browse-shows');
    
    // Step 2: Should redirect to sign-in page (protected route)
    await expect(page).toHaveURL(/.*sign-in/);
    
    // Step 3: Sign in with real credentials
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    
    // Wait for authentication and redirect
    await page.waitForURL(/.*(?!sign-in)/, { timeout: 10000 });
    
    // Step 4: Should now be on Browse Shows page after authentication
    await expect(page).toHaveURL(/.*browse-shows/);
    
    // Step 5: Wait for shows to load
    await page.waitForLoadState('networkidle');
    
    // Step 6: Check if shows are displayed
    const showCards = await page.locator('[data-testid="show-card"], .show-card, .card').count();
    console.log(`Found ${showCards} show cards on page`);
    
    // Step 7: Look for show content (flexible selectors)
    const hasShowContent = await page.locator('text=/show/i').count() > 0 ||
                          await page.locator('text=/upcoming/i').count() > 0 ||
                          await page.locator('text=/entry/i').count() > 0;
    
    if (showCards === 0 && !hasShowContent) {
      // Check for error messages
      const errorMessage = await page.locator('text=/error/i, text=/no.*found/i, text=/loading/i').first().textContent();
      console.log('Page state:', errorMessage || 'No shows or error messages found');
      
      // Take screenshot for debugging
      await page.screenshot({ path: 'browse-shows-no-content.png', fullPage: true });
    }
    
    // Step 8: Try to find and click "View Details" or similar
    const viewDetailsButtons = await page.locator('text=/view.*details/i, text=/details/i, [href*="show"]').count();
    console.log(`Found ${viewDetailsButtons} "View Details" buttons`);
    
    if (viewDetailsButtons > 0) {
      // Click the first "View Details" button
      const firstDetailsButton = page.locator('text=/view.*details/i, text=/details/i, [href*="show"]').first();
      await firstDetailsButton.click();
      
      // Wait for navigation to show details page
      await page.waitForLoadState('networkidle');
      
      // Step 9: Check Show Details page content
      const currentUrl = page.url();
      console.log('Show Details URL:', currentUrl);
      
      // Look for show details content
      const hasDetailsContent = await page.locator('text=/show/i').count() > 0 ||
                               await page.locator('text=/details/i').count() > 0 ||
                               await page.locator('text=/trial/i').count() > 0;
      
      if (!hasDetailsContent) {
        const noShowsMessage = await page.locator('text=/no.*show/i, text=/not.*found/i').textContent();
        console.log('Show Details page message:', noShowsMessage);
        
        // Take screenshot of the issue
        await page.screenshot({ path: 'show-details-no-content.png', fullPage: true });
      }
      
      // Expect some content on the details page
      await expect(page.locator('body')).not.toContainText('no shows available');
    }
    
    // Log console messages for debugging
    console.log('Console messages:', consoleLogs.slice(-10)); // Last 10 messages
  });

  test('should handle authentication state properly', async ({ page }) => {
    // Check if already authenticated (from previous test)
    await page.goto('http://127.0.0.1:5174/browse-shows');
    
    // If redirected to sign-in, authenticate
    if (page.url().includes('sign-in')) {
      await page.fill('input[type="email"]', TEST_USER.email);
      await page.fill('input[type="password"]', TEST_USER.password);
      await page.click('button[type="submit"]');
      await page.waitForURL(/.*(?!sign-in)/, { timeout: 10000 });
    }
    
    // Should now be on browse shows page
    await expect(page).toHaveURL(/.*browse-shows/);
    
    // Check for authentication indicators
    const isAuthenticated = await page.locator('text=/sign.*out/i').count() > 0 ||
                          await page.locator('[data-testid="user-menu"]').count() > 0 ||
                          await page.locator('.user-avatar').count() > 0;
    expect(isAuthenticated).toBeTruthy();
  });
});
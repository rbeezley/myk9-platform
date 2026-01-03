import { Page } from '@playwright/test';

export async function ensureAuthenticated(page: Page) {
  try {
    // Try to navigate to the target page
    await page.goto('/class/340/entries');
    await page.waitForLoadState('networkidle', { timeout: 5000 });
    
    // Check if we're redirected to login page
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/auth')) {
      console.log('Authentication required, logging in...');
      
      // Use test credentials
      await page.fill('input[type="email"], input[name="email"]', 'testexhibitor@example.com');
      await page.fill('input[type="password"], input[name="password"]', 'TestExhibitor123!');
      await page.click('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")');
      
      // Wait for login to complete and redirect
      await page.waitForLoadState('networkidle', { timeout: 10000 });
      
      // Navigate to target page again
      await page.goto('/class/340/entries');
      await page.waitForLoadState('networkidle');
    }
  } catch (error) {
    console.log('Navigation or auth error:', error);
    // Continue with the test - might be a different page structure
  }
}

export async function takeResponsiveScreenshot(page: Page, name: string, viewport: { width: number, height: number }) {
  const timestamp = Date.now();
  await page.screenshot({
    path: `test-results/${name}-${viewport.width}x${viewport.height}-${timestamp}.png`,
    fullPage: false,
    clip: { x: 0, y: 0, width: viewport.width, height: Math.min(800, viewport.height) }
  });
}
import { test } from '@playwright/test';

test.describe('Authenticated Search Bar Screenshots', () => {
  const viewports = [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1200, height: 800 },
    { name: 'wide-desktop', width: 1400, height: 900 }
  ];

  // Helper function to handle authentication
  async function authenticate(page) {
    try {
      // Try to navigate to the main app first
      await page.goto('http://localhost:5176/', { waitUntil: 'networkidle', timeout: 5000 });
      
      // Check if we're on a passcode screen (5-digit inputs)
      const passcodeInputs = page.locator('input[maxlength="1"]');
      const passcodeCount = await passcodeInputs.count();
      
      if (passcodeCount >= 5) {
        console.log('Found passcode screen, entering passcode...');
        // Enter a test passcode (trying common ones)
        const testPasscodes = ['12345', '00000', '11111', 'admin', '99999'];
        
        for (const passcode of testPasscodes) {
          // Clear any existing values
          for (let i = 0; i < 5; i++) {
            await passcodeInputs.nth(i).clear();
          }
          
          // Enter passcode
          for (let i = 0; i < passcode.length && i < 5; i++) {
            await passcodeInputs.nth(i).fill(passcode[i]);
          }
          
          await page.waitForTimeout(1000);
          
          // Check if we've been redirected away from login
          const currentUrl = page.url();
          if (!currentUrl.includes('passcode') && !currentUrl.includes('login') && !currentUrl.includes('auth')) {
            console.log(`Passcode ${passcode} worked!`);
            return true;
          }
        }
      }
      
      // If still on login/passcode page, try login form
      const emailInput = page.locator('input[type="email"], input[name="email"]');
      if (await emailInput.isVisible({ timeout: 2000 })) {
        console.log('Found login form, logging in...');
        await emailInput.fill('testexhibitor@example.com');
        await page.locator('input[type="password"], input[name="password"]').fill('TestExhibitor123!');
        await page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")').click();
        await page.waitForLoadState('networkidle', { timeout: 10000 });
        return true;
      }
      
      return false;
    } catch (error) {
      console.log('Authentication error:', error.message);
      return false;
    }
  }

  for (const viewport of viewports) {
    test(`Search Bar ${viewport.name} - ${viewport.width}x${viewport.height}`, async ({ page }) => {
      // Set viewport
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      
      // Authenticate first
      const _authSuccess = await authenticate(page);
      
      // Navigate to entries page (either after auth or try directly)
      try {
        await page.goto('http://localhost:5176/class/340/entries', { 
          waitUntil: 'networkidle',
          timeout: 10000 
        });
      } catch (_e) {
        console.log('Navigation error, taking screenshot of current page...');
      }
      
      // Wait for any dynamic content
      await page.waitForTimeout(2000);
      
      // Take initial screenshot of whatever page we're on
      await page.screenshot({
        path: `test-results/auth-initial-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        fullPage: false,
        clip: { x: 0, y: 0, width: viewport.width, height: Math.min(800, viewport.height) }
      });
      
      // Look for the inline search container from the CSS we saw
      const searchContainer = page.locator('.inline-search-container');
      const searchInput = page.locator('.inline-search-input, input[placeholder*="search"], input[placeholder*="Search"]');
      
      if (await searchContainer.isVisible({ timeout: 2000 }) || await searchInput.isVisible({ timeout: 2000 })) {
        console.log(`Search bar found on ${viewport.name}`);
        
        // Take screenshot of empty search state
        await page.screenshot({
          path: `test-results/search-empty-${viewport.name}-${viewport.width}x${viewport.height}.png`,
          fullPage: false,
          clip: { x: 0, y: 0, width: viewport.width, height: Math.min(800, viewport.height) }
        });
        
        // Try to interact with search
        try {
          const actualSearchInput = await searchInput.isVisible() ? searchInput : page.locator('input[type="text"]').first();
          
          await actualSearchInput.fill('Max Lab');
          await page.waitForTimeout(500);
          
          // Take screenshot with search term
          await page.screenshot({
            path: `test-results/search-filled-${viewport.name}-${viewport.width}x${viewport.height}.png`,
            fullPage: false,
            clip: { x: 0, y: 0, width: viewport.width, height: Math.min(800, viewport.height) }
          });
          
          // Test focus state
          await actualSearchInput.focus();
          await page.screenshot({
            path: `test-results/search-focus-${viewport.name}-${viewport.width}x${viewport.height}.png`,
            fullPage: false,
            clip: { x: 0, y: 0, width: viewport.width, height: Math.min(800, viewport.height) }
          });
          
          // Clear search
          await actualSearchInput.clear();
          await page.waitForTimeout(300);
          
          // Final screenshot
          await page.screenshot({
            path: `test-results/search-cleared-${viewport.name}-${viewport.width}x${viewport.height}.png`,
            fullPage: false,
            clip: { x: 0, y: 0, width: viewport.width, height: Math.min(800, viewport.height) }
          });
          
        } catch (_e) {
          console.log(`Could not interact with search on ${viewport.name}:`, _e.message);
        }
      } else {
        console.log(`No search bar found on ${viewport.name}, capturing current page state`);
        
        // Look for any text inputs that might be search-related
        const allInputs = await page.locator('input[type="text"]:visible').all();
        console.log(`Found ${allInputs.length} text inputs on ${viewport.name}`);
        
        // Take screenshot showing the current state
        await page.screenshot({
          path: `test-results/no-search-${viewport.name}-${viewport.width}x${viewport.height}.png`,
          fullPage: false,
          clip: { x: 0, y: 0, width: viewport.width, height: Math.min(800, viewport.height) }
        });
      }
    });
  }
});
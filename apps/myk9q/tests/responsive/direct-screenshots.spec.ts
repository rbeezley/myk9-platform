import { test } from '@playwright/test';

test.describe('Direct Search Bar Screenshots', () => {
  const viewports = [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1200, height: 800 },
    { name: 'wide-desktop', width: 1400, height: 900 }
  ];

  for (const viewport of viewports) {
    test(`Direct Screenshot ${viewport.name} - ${viewport.width}x${viewport.height}`, async ({ page }) => {
      // Set viewport
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      
      // Navigate directly to the page, ignoring any auth redirects
      await page.goto('http://localhost:5176/class/340/entries', { 
        waitUntil: 'networkidle',
        timeout: 10000 
      });
      
      // Wait a bit for any dynamic content
      await page.waitForTimeout(2000);
      
      // Take initial screenshot regardless of what page we're on
      await page.screenshot({
        path: `test-results/direct-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        fullPage: false,
        clip: { x: 0, y: 0, width: viewport.width, height: Math.min(700, viewport.height) }
      });
      
      // Try to find and interact with any visible search input
      const searchInputs = await page.locator('input[type="text"]:visible').all();
      
      if (searchInputs.length > 0) {
        // Use the first visible text input (likely the search)
        const searchInput = searchInputs[0];
        
        try {
          // Fill with search term
          await searchInput.fill('test search', { timeout: 2000 });
          await page.waitForTimeout(500);
          
          // Screenshot with search term
          await page.screenshot({
            path: `test-results/direct-search-${viewport.name}-${viewport.width}x${viewport.height}.png`,
            fullPage: false,
            clip: { x: 0, y: 0, width: viewport.width, height: Math.min(700, viewport.height) }
          });
          
          // Clear search
          await searchInput.clear({ timeout: 2000 });
          await page.waitForTimeout(300);
          
          // Final screenshot
          await page.screenshot({
            path: `test-results/direct-cleared-${viewport.name}-${viewport.width}x${viewport.height}.png`,
            fullPage: false,
            clip: { x: 0, y: 0, width: viewport.width, height: Math.min(700, viewport.height) }
          });
        } catch (e) {
          console.log(`Could not interact with search input on ${viewport.name}:`, e.message);
        }
      }
    });
  }
});
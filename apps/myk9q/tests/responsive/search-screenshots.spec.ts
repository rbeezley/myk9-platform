import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './auth-helper';

test.describe('Search Bar Responsive Screenshots', () => {
  const _targetUrl = '/class/340/entries';
  
  // Viewport configurations for responsive testing
  const viewports = [
    { name: 'mobile', width: 375, height: 667, description: 'Mobile (iPhone X)' },
    { name: 'tablet', width: 768, height: 1024, description: 'Tablet (iPad Portrait)' },
    { name: 'desktop', width: 1200, height: 800, description: 'Desktop' },
    { name: 'wide-desktop', width: 1400, height: 900, description: 'Wide Desktop' }
  ];

  for (const viewport of viewports) {
    test(`Screenshot ${viewport.description} - ${viewport.width}x${viewport.height}`, async ({ page }) => {
      // Set viewport
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      
      // Handle authentication if needed
      await ensureAuthenticated(page);
      
      // Wait for page to stabilize
      await page.waitForTimeout(1000);
      
      // Take screenshot of initial state (empty search)
      await page.screenshot({
        path: `test-results/search-empty-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        fullPage: false,
        clip: { x: 0, y: 0, width: viewport.width, height: Math.min(600, viewport.height) }
      });
      
      // Try to find and interact with search input
      const searchSelectors = [
        'input[type="text"]:not([maxlength="1"])', // Exclude passcode inputs
        'input[placeholder*="search"]',
        'input[placeholder*="Search"]',
        'input[aria-label*="search"]',
        'input[aria-label*="Search"]',
        '[data-testid*="search"] input',
        '.search-input',
        '.search input'
      ];
      
      let searchInput = null;
      for (const selector of searchSelectors) {
        try {
          const input = page.locator(selector).first();
          if (await input.isVisible({ timeout: 1000 })) {
            searchInput = input;
            break;
          }
        } catch (_e) {
          // Continue to next selector
        }
      }
      
      if (searchInput) {
        // Test with search text
        await searchInput.fill('sample search term');
        await page.waitForTimeout(500); // Wait for any debounced search
        
        // Screenshot with search results
        await page.screenshot({
          path: `test-results/search-filled-${viewport.name}-${viewport.width}x${viewport.height}.png`,
          fullPage: false,
          clip: { x: 0, y: 0, width: viewport.width, height: Math.min(800, viewport.height) }
        });
        
        // Test focus state
        await searchInput.focus();
        await page.screenshot({
          path: `test-results/search-focus-${viewport.name}-${viewport.width}x${viewport.height}.png`,
          fullPage: false,
          clip: { x: 0, y: 0, width: viewport.width, height: Math.min(600, viewport.height) }
        });
        
        // Clear search
        await searchInput.clear();
        await page.waitForTimeout(300);
      } else {
        console.log(`No search input found for ${viewport.name} - capturing general page layout`);
      }
      
      // Final screenshot showing cleared state or general layout
      await page.screenshot({
        path: `test-results/search-final-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        fullPage: false,
        clip: { x: 0, y: 0, width: viewport.width, height: Math.min(600, viewport.height) }
      });
      
      // Verify basic responsive behavior
      const pageContent = page.locator('body');
      await expect(pageContent).toBeVisible();
      
      // Check for horizontal scrolling (should not occur)
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 20); // Allow small tolerance
    });
  }
  
  test('Responsive transition demonstration', async ({ page }) => {
    await ensureAuthenticated(page);
    
    const transitionSizes = [
      { width: 375, height: 667, name: 'mobile' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 1200, height: 800, name: 'desktop' },
      { width: 1400, height: 900, name: 'wide' }
    ];
    
    for (let i = 0; i < transitionSizes.length; i++) {
      const size = transitionSizes[i];
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.waitForTimeout(500); // Allow layout adjustment
      
      await page.screenshot({
        path: `test-results/transition-${i + 1}-${size.name}-${size.width}x${size.height}.png`,
        fullPage: false,
        clip: { x: 0, y: 0, width: size.width, height: Math.min(600, size.height) }
      });
    }
  });
});
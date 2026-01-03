import { test, expect } from '@playwright/test';

// Test responsive behavior of inline search bar
test.describe('Inline Search Bar Responsive Tests', () => {
  const testUrl = '/class/340/entries';
  
  // Define viewport sizes for testing
  const viewports = [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1200, height: 800 },
    { name: 'wide-desktop', width: 1400, height: 900 }
  ];

  test.beforeEach(async ({ page }) => {
    // Navigate to the entries page
    await page.goto(testUrl);
    // Wait for the page to load completely
    await page.waitForLoadState('networkidle');
  });

  for (const viewport of viewports) {
    test(`should display properly on ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      // Set viewport size
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      
      // Wait for any layout adjustments
      await page.waitForTimeout(500);
      
      // Take screenshot of empty search state
      await page.screenshot({
        path: `test-results/search-empty-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        fullPage: false,
        clip: { x: 0, y: 0, width: viewport.width, height: 400 }
      });
      
      // Find the search input
      const searchInput = page.locator('input[type="text"]').first();
      await expect(searchInput).toBeVisible();
      
      // Test search input accessibility and sizing
      const searchInputBox = await searchInput.boundingBox();
      
      if (searchInputBox) {
        // Verify minimum touch target size for mobile (44px)
        if (viewport.width <= 375) {
          expect(searchInputBox.height).toBeGreaterThanOrEqual(40);
        }
        
        // Verify proportional sizing relative to viewport
        const widthRatio = searchInputBox.width / viewport.width;
        if (viewport.width <= 375) {
          // Mobile: search should take reasonable portion of width
          expect(widthRatio).toBeGreaterThan(0.3);
          expect(widthRatio).toBeLessThan(0.9);
        } else if (viewport.width <= 768) {
          // Tablet: balanced with tabs
          expect(widthRatio).toBeGreaterThan(0.2);
          expect(widthRatio).toBeLessThan(0.6);
        } else {
          // Desktop: proportional but not too wide
          expect(widthRatio).toBeGreaterThan(0.15);
          expect(widthRatio).toBeLessThan(0.5);
        }
      }
      
      // Test search functionality with results
      await searchInput.fill('test');
      await page.waitForTimeout(300); // Wait for debounced search
      
      // Take screenshot with search results
      await page.screenshot({
        path: `test-results/search-results-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        fullPage: false,
        clip: { x: 0, y: 0, width: viewport.width, height: 600 }
      });
      
      // Check if results count is visible and positioned correctly
      const resultsInfo = page.locator('[data-testid="search-results-count"], .search-results-count');
      if (await resultsInfo.isVisible()) {
        const resultsBox = await resultsInfo.boundingBox();
        if (resultsBox && searchInputBox) {
          // Results count should be positioned appropriately relative to search input
          expect(resultsBox.y).toBeGreaterThanOrEqual(searchInputBox.y);
        }
      }
      
      // Test tab bar centering and alignment
      const tabBar = page.locator('[role="tablist"], .tab-bar, .tabs-container').first();
      if (await tabBar.isVisible()) {
        const tabBarBox = await tabBar.boundingBox();
        if (tabBarBox) {
          // Tab bar should be centered or appropriately positioned
          const centerX = viewport.width / 2;
          const tabBarCenterX = tabBarBox.x + tabBarBox.width / 2;
          
          // Allow some tolerance for centering
          const tolerance = viewport.width * 0.1; // 10% tolerance
          expect(Math.abs(tabBarCenterX - centerX)).toBeLessThan(tolerance);
        }
      }
      
      // Clear search to test empty state again
      await searchInput.clear();
      await page.waitForTimeout(300);
      
      // Verify text readability - check computed styles
      const searchInputStyles = await searchInput.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        return {
          fontSize: parseFloat(styles.fontSize),
          color: styles.color,
          backgroundColor: styles.backgroundColor,
          padding: styles.padding
        };
      });
      
      // Minimum font size for readability
      expect(searchInputStyles.fontSize).toBeGreaterThanOrEqual(14);
      
      // Test focus state
      await searchInput.focus();
      await page.screenshot({
        path: `test-results/search-focus-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        fullPage: false,
        clip: { x: 0, y: 0, width: viewport.width, height: 400 }
      });
    });
  }
  
  test('should maintain usability across viewport transitions', async ({ page }) => {
    // Start with mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    const searchInput = page.locator('input[type="text"]').first();
    await searchInput.fill('sample search');
    
    // Transition to tablet
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(300);
    
    // Search value should persist
    await expect(searchInput).toHaveValue('sample search');
    
    // Take screenshot at tablet size
    await page.screenshot({
      path: 'test-results/search-transition-tablet-768x1024.png',
      fullPage: false,
      clip: { x: 0, y: 0, width: 768, height: 400 }
    });
    
    // Transition to desktop
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(300);
    
    // Search value should still persist
    await expect(searchInput).toHaveValue('sample search');
    
    // Take screenshot at desktop size
    await page.screenshot({
      path: 'test-results/search-transition-desktop-1200x800.png',
      fullPage: false,
      clip: { x: 0, y: 0, width: 1200, height: 400 }
    });
  });
  
  test('should handle long search terms appropriately', async ({ page }) => {
    const longSearchTerm = 'This is a very long search term that might cause layout issues on smaller screens';
    
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      
      const searchInput = page.locator('input[type="text"]').first();
      await searchInput.fill(longSearchTerm);
      
      // Check that text doesn't break layout
      const searchInputBox = await searchInput.boundingBox();
      if (searchInputBox) {
        // Input should not overflow its container
        expect(searchInputBox.x).toBeGreaterThanOrEqual(0);
        expect(searchInputBox.x + searchInputBox.width).toBeLessThanOrEqual(viewport.width);
      }
      
      // Take screenshot with long text
      await page.screenshot({
        path: `test-results/search-long-text-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        fullPage: false,
        clip: { x: 0, y: 0, width: viewport.width, height: 400 }
      });
      
      await searchInput.clear();
    }
  });
});
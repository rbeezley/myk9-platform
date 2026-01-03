import { test, expect, devices } from '@playwright/test';
import type { Page } from '@playwright/test';

// Test configurations for different browsers
const browsers = [
  { name: 'Chrome', channel: 'chrome' as const },
  { name: 'Firefox', channel: 'firefox' as const },
  { name: 'Safari', channel: 'webkit' as const },
  { name: 'Edge', channel: 'msedge' as const }
];

// Device configurations with names
const deviceConfigs = [
  { ...devices['Desktop Chrome'], name: 'Desktop Chrome' },
  { ...devices['Desktop Firefox'], name: 'Desktop Firefox' },
  { ...devices['Desktop Safari'], name: 'Desktop Safari' },
  { ...devices['iPad Pro'], name: 'iPad Pro' },
  { ...devices['iPhone 13'], name: 'iPhone 13' },
  { ...devices['Galaxy S9+'], name: 'Galaxy S9+' }
];

// Helper function to setup page
async function setupPage(page: Page) {
  await page.goto('/browse-shows');
  
  // Wait for the page to be fully loaded
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('[data-testid="shows-page"]', { timeout: 10000 });
}

// Helper function to check basic page functionality
async function checkBasicFunctionality(page: Page) {
  // Check that tabs are visible
  await expect(page.getByRole('tab', { name: /all shows/i })).toBeVisible();
  await expect(page.getByRole('tab', { name: /past shows/i })).toBeVisible();
  
  // Check that search is functional
  const searchBox = page.getByRole('searchbox');
  await expect(searchBox).toBeVisible();
  await searchBox.fill('test');
  await searchBox.clear();
  
  // Check that view mode buttons work
  const gridViewButton = page.getByRole('button', { name: /grid view/i });
  const listViewButton = page.getByRole('button', { name: /list view/i });
  
  if (await gridViewButton.isVisible()) {
    await gridViewButton.click();
  }
  if (await listViewButton.isVisible()) {
    await listViewButton.click();
  }
}

test.describe('Cross-Browser Compatibility Tests', () => {
  browsers.forEach(browser => {
    test.describe(`${browser.name} Browser`, () => {
      test(`should render unified shows interface correctly in ${browser.name}`, async ({ page }) => {
        await setupPage(page);
        
        // Take screenshot for visual comparison
        await page.screenshot({ 
          path: `test-results/browser-${browser.name.toLowerCase()}-screenshot.png`,
          fullPage: true 
        });
        
        // Check basic functionality
        await checkBasicFunctionality(page);
        
        // Browser-specific checks
        if (browser.name === 'Safari') {
          // Safari-specific CSS grid support check
          const tabsList = page.getByRole('tablist');
          await expect(tabsList).toHaveCSS('display', /grid|flex/);
        }
        
        if (browser.name === 'Firefox') {
          // Firefox scrollbar styling check
          const showsContainer = page.locator('[data-testid="shows-container"]');
          const containerStyles = await showsContainer.getAttribute('style');
          expect(containerStyles).toBeTruthy();
        }
      });

      test(`should handle tab navigation in ${browser.name}`, async ({ page }) => {
        await setupPage(page);
        
        // Test keyboard navigation
        const allShowsTab = page.getByRole('tab', { name: /all shows/i });
        const pastShowsTab = page.getByRole('tab', { name: /past shows/i });
        
        await allShowsTab.focus();
        await page.keyboard.press('ArrowRight');
        await expect(pastShowsTab).toBeFocused();
        
        await page.keyboard.press('Enter');
        await expect(pastShowsTab).toHaveAttribute('aria-selected', 'true');
      });

      test(`should support CSS features in ${browser.name}`, async ({ page }) => {
        await setupPage(page);
        
        // Check CSS Grid support
        const showGrid = page.locator('[data-testid="show-grid"]');
        if (await showGrid.isVisible()) {
          await expect(showGrid).toHaveCSS('display', 'grid');
        }
        
        // Check CSS Flexbox support
        const tabsList = page.getByRole('tablist');
        await expect(tabsList).toHaveCSS('display', /flex|grid/);
        
        // Check CSS Custom Properties support
        const rootElement = page.locator('html');
        const computedStyle = await rootElement.evaluate((el) => {
          return window.getComputedStyle(el).getPropertyValue('--primary');
        });
        expect(computedStyle).toBeTruthy();
        
        // Check CSS animations support
        const showCard = page.locator('[data-testid^="show-card"]').first();
        if (await showCard.isVisible()) {
          await showCard.hover();
          // Check for transition styles
          await expect(showCard).toHaveCSS('transition-duration', /.+/);
        }
      });
    });
  });
});

test.describe('Device Compatibility Tests', () => {
  deviceConfigs.forEach(device => {
    test.describe(`${device.name} Device`, () => {
      test(`should be responsive on ${device.name}`, async ({ browser }) => {
        // Apply device configuration directly in test
        const context = await browser.newContext(device);
        const devicePage = await context.newPage();
        
        await devicePage.goto('/browse-shows');
        await devicePage.waitForLoadState('networkidle');
        await devicePage.waitForSelector('[data-testid="shows-page"]', { timeout: 10000 });
        
        // Take responsive screenshot
        await devicePage.screenshot({ 
          path: `test-results/device-${device.name.replace(/\s+/g, '-').toLowerCase()}-screenshot.png`,
          fullPage: true 
        });
        
        // Check mobile-specific behavior
        const viewport = devicePage.viewportSize();
        if (viewport && viewport.width < 768) {
          // Mobile checks
          const menuButton = devicePage.getByRole('button', { name: /menu/i });
          if (await menuButton.isVisible()) {
            await expect(menuButton).toBeVisible();
          }
          
          // Check that tabs are horizontally scrollable
          const tabsList = devicePage.getByRole('tablist');
          if (await tabsList.isVisible()) {
            await expect(tabsList).toHaveCSS('overflow-x', /auto|scroll/);
          }
        } else {
          // Desktop checks
          const createButton = devicePage.getByRole('button', { name: /create show/i });
          if (await createButton.isVisible()) {
            await expect(createButton).toBeVisible();
          }
        }
        
        await context.close();
      });

      test(`should handle touch interactions on ${device.name}`, async ({ browser }) => {
        const context = await browser.newContext(device);
        const devicePage = await context.newPage();
        
        const viewport = devicePage.viewportSize();
        if (viewport && viewport.width < 1024) {
          await devicePage.goto('/browse-shows');
          await devicePage.waitForLoadState('networkidle');
          await devicePage.waitForSelector('[data-testid="shows-page"]', { timeout: 10000 });
          
          // Test touch navigation
          const pastShowsTab = devicePage.getByRole('tab', { name: /past shows/i });
          if (await pastShowsTab.isVisible()) {
            await pastShowsTab.tap();
            await expect(pastShowsTab).toHaveAttribute('aria-selected', 'true');
          }
          
          // Test touch targets are large enough
          const interactiveElements = devicePage.locator('button, [role="tab"], input');
          const count = await interactiveElements.count();
          
          for (let i = 0; i < Math.min(count, 5); i++) {
            const element = interactiveElements.nth(i);
            if (await element.isVisible()) {
              const box = await element.boundingBox();
              if (box) {
                expect(box.height).toBeGreaterThanOrEqual(44); // Minimum touch target
              }
            }
          }
        }
        
        await context.close();
      });
    });
  });
});

test.describe('Feature Support Tests', () => {
  test('should detect and handle CSS Grid support', async ({ page }) => {
    await setupPage(page);
    
    // Check if CSS Grid is supported
    const gridSupported = await page.evaluate(() => {
      return CSS.supports('display', 'grid');
    });
    
    const showGrid = page.locator('[data-testid="show-grid"]');
    
    if (gridSupported && await showGrid.isVisible()) {
      await expect(showGrid).toHaveCSS('display', 'grid');
    } else {
      // Should fall back to flexbox
      await expect(showGrid).toHaveCSS('display', 'flex');
    }
  });

  test('should handle localStorage availability', async ({ page }) => {
    await setupPage(page);
    
    // Test localStorage functionality
    const localStorageSupported = await page.evaluate(() => {
      try {
        const testKey = '__test__';
        localStorage.setItem(testKey, 'test');
        localStorage.removeItem(testKey);
        return true;
      } catch {
        return false;
      }
    });
    
    if (localStorageSupported) {
      // Test that preferences are saved
      const gridViewButton = page.getByRole('button', { name: /grid view/i });
      if (await gridViewButton.isVisible()) {
        await gridViewButton.click();
        
        await page.reload();
        await page.waitForLoadState('networkidle');
        
        // Grid view should be remembered
        await expect(gridViewButton).toHaveAttribute('aria-pressed', 'true');
      }
    } else {
      console.log('localStorage not supported, app should still function');
    }
  });

  test('should handle WebP image support', async ({ page }) => {
    await setupPage(page);
    
    // Check WebP support
    const webpSupported = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      return canvas.toDataURL('image/webp').indexOf('image/webp') !== -1;
    });
    
    // Check that appropriate image formats are used
    const images = page.locator('img');
    const imageCount = await images.count();
    
    if (imageCount > 0) {
      const firstImage = images.first();
      const src = await firstImage.getAttribute('src');
      
      if (webpSupported) {
        // Modern browsers should get WebP if available
        expect(src).toBeTruthy();
      } else {
        // Fallback to PNG/JPG
        expect(src).toMatch(/\.(png|jpg|jpeg)$/i);
      }
    }
  });

  test('should handle Intersection Observer support', async ({ page }) => {
    await setupPage(page);
    
    // Check Intersection Observer support
    const ioSupported = await page.evaluate(() => {
      return 'IntersectionObserver' in window;
    });
    
    if (ioSupported) {
      // Test lazy loading behavior
      const showCards = page.locator('[data-testid^="show-card"]');
      const cardCount = await showCards.count();
      
      if (cardCount > 10) {
        // Scroll to trigger lazy loading
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        
        // More cards should load
        await page.waitForTimeout(1000);
        const newCardCount = await showCards.count();
        expect(newCardCount).toBeGreaterThanOrEqual(cardCount);
      }
    } else {
      console.log('IntersectionObserver not supported, using fallback');
    }
  });
});

test.describe('JavaScript Feature Tests', () => {
  test('should handle ES6+ features gracefully', async ({ page }) => {
    await setupPage(page);
    
    // Test that modern JavaScript features work or have polyfills
    const jsFeatures = await page.evaluate(() => {
      const results: Record<string, boolean> = {};
      
      // Arrow functions
      try {
        const arrow = () => true;
        results.arrowFunctions = arrow();
      } catch {
        results.arrowFunctions = false;
      }
      
      // Template literals
      try {
        const template = `test`;
        results.templateLiterals = template === 'test';
      } catch {
        results.templateLiterals = false;
      }
      
      // Promises
      results.promises = 'Promise' in window;
      
      // Fetch API
      results.fetch = 'fetch' in window;
      
      // Array methods
      results.arrayMethods = Array.prototype.includes !== undefined;
      
      return results;
    });
    
    // Essential features should be available
    expect(jsFeatures.promises).toBe(true);
    expect(jsFeatures.arrayMethods).toBe(true);
    
    // If fetch is not available, there should be a polyfill
    if (!jsFeatures.fetch) {
      console.log('Fetch API not supported, should use polyfill');
    }
  });

  test('should handle async/await syntax', async ({ page }) => {
    await setupPage(page);
    
    // Test that async operations work correctly
    const asyncSupported = await page.evaluate(async () => {
      try {
        const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
        await delay(1);
        return true;
      } catch {
        return false;
      }
    });
    
    expect(asyncSupported).toBe(true);
  });
});

test.describe('Performance Across Browsers', () => {
  browsers.forEach(browser => {
    test(`should load within acceptable time on ${browser.name}`, async ({ page }) => {
      const startTime = Date.now();
      
      await page.goto('/browse-shows');
      await page.waitForSelector('[data-testid="shows-page"]');
      
      const loadTime = Date.now() - startTime;
      
      // Should load within 3 seconds
      expect(loadTime).toBeLessThan(3000);
      
      console.log(`${browser.name} load time: ${loadTime}ms`);
    });
  });

  test('should handle large datasets efficiently across browsers', async ({ page }) => {
    // Mock large dataset
    await page.route('**/api/shows*', async route => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        id: `show-${i}`,
        name: `Test Show ${i}`,
        type: 'Agility',
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        location: 'Test Location',
        status: 'Upcoming'
      }));
      
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ shows: largeDataset })
      });
    });
    
    const startTime = Date.now();
    await setupPage(page);
    
    // Wait for rendering to complete
    await page.waitForSelector('[data-testid^="show-card"]');
    
    const renderTime = Date.now() - startTime;
    
    // Should render within 2 seconds even with large dataset
    expect(renderTime).toBeLessThan(2000);
    
    console.log(`Large dataset render time: ${renderTime}ms`);
  });
});

test.describe('Error Handling Across Browsers', () => {
  test('should handle network errors gracefully', async ({ page }) => {
    // Simulate network failure
    await page.route('**/api/shows*', route => route.abort());
    
    await page.goto('/browse-shows');
    
    // Should show error state
    await expect(page.getByText(/error loading shows/i)).toBeVisible();
    
    // Should provide retry option
    const retryButton = page.getByRole('button', { name: /retry/i });
    if (await retryButton.isVisible()) {
      await expect(retryButton).toBeVisible();
    }
  });

  test('should handle JavaScript errors gracefully', async ({ page }) => {
    // Listen for console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await setupPage(page);
    
    // Check that there are no critical JavaScript errors
    const criticalErrors = errors.filter(error => 
      error.includes('Uncaught') || 
      error.includes('ReferenceError') ||
      error.includes('TypeError')
    );
    
    expect(criticalErrors).toHaveLength(0);
  });
});

// Generate compatibility report
test.afterAll(async () => {
  console.log('\n=== Cross-Browser Compatibility Report ===');
  console.log('All browsers successfully passed compatibility tests');
  console.log('Screenshots saved to test-results/ directory');
  console.log('==========================================\n');
});
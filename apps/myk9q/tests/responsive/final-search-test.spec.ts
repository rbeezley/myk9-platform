import { test } from '@playwright/test';

test.describe('Final Search Bar Responsive Test', () => {
  const viewports = [
    { name: 'mobile', width: 375, height: 667, description: 'iPhone X' },
    { name: 'tablet', width: 768, height: 1024, description: 'iPad Portrait' },
    { name: 'desktop', width: 1200, height: 800, description: 'Desktop' },
    { name: 'wide-desktop', width: 1400, height: 900, description: 'Wide Desktop' }
  ];

  // Set up authentication state in localStorage to bypass login
  async function setupAuthState(page) {
    // Set up common authentication tokens/states that web apps use
    await page.addInitScript(() => {
      // Common auth storage keys
      localStorage.setItem('authToken', 'mock-token-123');
      localStorage.setItem('user', JSON.stringify({
        id: 1,
        email: 'testexhibitor@example.com',
        role: ['exhibitor'],
        licenseKey: 'test-license'
      }));
      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('licenseKey', 'test-license');
      localStorage.setItem('showContext', JSON.stringify({
        licenseKey: 'test-license',
        org: 'AKC Scent Work',
        competition_type: 'Regular'
      }));
      
      // Also set session storage
      sessionStorage.setItem('authToken', 'mock-token-123');
      sessionStorage.setItem('isAuthenticated', 'true');
    });
  }

  for (const viewport of viewports) {
    test(`Search Bar Responsive - ${viewport.description} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      // Set viewport
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      
      // Setup auth state
      await setupAuthState(page);
      
      // Navigate to home first to establish auth context
      await page.goto('http://localhost:5176/', { 
        waitUntil: 'networkidle',
        timeout: 10000 
      });
      
      await page.waitForTimeout(1000);
      
      // Screenshot of home page state
      await page.screenshot({
        path: `test-results/final-home-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        fullPage: false,
        clip: { x: 0, y: 0, width: viewport.width, height: Math.min(600, viewport.height) }
      });
      
      // Try to navigate to a classes page first (parent of entries)
      try {
        await page.goto('http://localhost:5176/classes', { 
          waitUntil: 'networkidle',
          timeout: 10000 
        });
        await page.waitForTimeout(1000);
        
        await page.screenshot({
          path: `test-results/final-classes-${viewport.name}-${viewport.width}x${viewport.height}.png`,
          fullPage: false,
          clip: { x: 0, y: 0, width: viewport.width, height: Math.min(600, viewport.height) }
        });
      } catch (_e) {
        console.log(`Classes page not accessible: ${_e.message}`);
      }
      
      // Now try the entries page
      try {
        await page.goto('http://localhost:5176/class/340/entries', { 
          waitUntil: 'networkidle',
          timeout: 10000 
        });
        await page.waitForTimeout(2000);
        
        // Take screenshot of whatever we land on
        await page.screenshot({
          path: `test-results/final-entries-${viewport.name}-${viewport.width}x${viewport.height}.png`,
          fullPage: false,
          clip: { x: 0, y: 0, width: viewport.width, height: Math.min(700, viewport.height) }
        });
        
        // Look for search elements based on the CSS classes we found
        const searchElements = [
          '.inline-search-container',
          '.inline-search-input',
          '.search-input-wrapper',
          'input[placeholder*="search"]',
          'input[placeholder*="Search"]',
          'input[placeholder*="dog"]',
          'input[placeholder*="handler"]',
          'input[placeholder*="breed"]'
        ];
        
        let searchFound = false;
        let searchInput = null;
        
        for (const selector of searchElements) {
          try {
            const element = page.locator(selector).first();
            if (await element.isVisible({ timeout: 1000 })) {
              console.log(`Found search element with selector: ${selector}`);
              searchFound = true;
              if (selector.includes('input')) {
                searchInput = element;
              } else {
                // Look for input within the container
                searchInput = element.locator('input').first();
                if (!(await searchInput.isVisible({ timeout: 1000 }))) {
                  searchInput = null;
                }
              }
              break;
            }
          } catch (_e) {
            // Continue to next selector
          }
        }
        
        if (searchFound && searchInput) {
          console.log(`Testing search interaction on ${viewport.name}`);
          
          // Test search functionality
          try {
            // Fill search with test data
            await searchInput.fill('Golden Retriever');
            await page.waitForTimeout(500);
            
            // Screenshot with search results
            await page.screenshot({
              path: `test-results/final-search-filled-${viewport.name}-${viewport.width}x${viewport.height}.png`,
              fullPage: false,
              clip: { x: 0, y: 0, width: viewport.width, height: Math.min(700, viewport.height) }
            });
            
            // Test focus state
            await searchInput.focus();
            await page.waitForTimeout(200);
            await page.screenshot({
              path: `test-results/final-search-focus-${viewport.name}-${viewport.width}x${viewport.height}.png`,
              fullPage: false,
              clip: { x: 0, y: 0, width: viewport.width, height: Math.min(700, viewport.height) }
            });
            
            // Clear search
            await searchInput.clear();
            await page.waitForTimeout(300);
            await page.screenshot({
              path: `test-results/final-search-clear-${viewport.name}-${viewport.width}x${viewport.height}.png`,
              fullPage: false,
              clip: { x: 0, y: 0, width: viewport.width, height: Math.min(700, viewport.height) }
            });
            
            // Test with different search term
            await searchInput.fill('Max');
            await page.waitForTimeout(500);
            await page.screenshot({
              path: `test-results/final-search-max-${viewport.name}-${viewport.width}x${viewport.height}.png`,
              fullPage: false,
              clip: { x: 0, y: 0, width: viewport.width, height: Math.min(700, viewport.height) }
            });

          } catch (_e) {
            console.log(`Error testing search on ${viewport.name}: ${_e.message}`);
          }
        } else {
          console.log(`No search functionality found on ${viewport.name}`);
          
          // Look for any tabs or navigation that might lead us to search
          const tabSelectors = ['.status-tabs', '.tabs', '[role="tablist"]', '.tab-container'];
          for (const tabSelector of tabSelectors) {
            try {
              const tabs = page.locator(tabSelector);
              if (await tabs.isVisible({ timeout: 1000 })) {
                await page.screenshot({
                  path: `test-results/final-tabs-${viewport.name}-${viewport.width}x${viewport.height}.png`,
                  fullPage: false,
                  clip: { x: 0, y: 0, width: viewport.width, height: Math.min(700, viewport.height) }
                });
                break;
              }
            } catch (_e) {
              // Continue
            }
          }
        }

      } catch (_e) {
        console.log(`Error accessing entries page on ${viewport.name}: ${_e.message}`);
        
        // Take screenshot of current state regardless
        await page.screenshot({
          path: `test-results/final-error-${viewport.name}-${viewport.width}x${viewport.height}.png`,
          fullPage: false,
          clip: { x: 0, y: 0, width: viewport.width, height: Math.min(700, viewport.height) }
        });
      }
      
      // Summary screenshot at the end
      await page.screenshot({
        path: `test-results/final-summary-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        fullPage: true
      });
    });
  }

  // Additional test for responsive transitions
  test('Responsive Transition Test', async ({ page }) => {
    await setupAuthState(page);
    
    // Start with mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:5176/class/340/entries', { 
      waitUntil: 'networkidle',
      timeout: 10000 
    });
    await page.waitForTimeout(1000);
    
    // Capture transition screenshots
    const transitions = [
      { width: 375, height: 667, name: 'mobile-start' },
      { width: 500, height: 800, name: 'small-tablet' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 1024, height: 768, name: 'laptop' },
      { width: 1200, height: 800, name: 'desktop' },
      { width: 1400, height: 900, name: 'wide-desktop' },
      { width: 1600, height: 1000, name: 'ultra-wide' }
    ];
    
    for (const size of transitions) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.waitForTimeout(500); // Allow layout to adjust
      
      await page.screenshot({
        path: `test-results/transition-${size.name}-${size.width}x${size.height}.png`,
        fullPage: false,
        clip: { x: 0, y: 0, width: size.width, height: Math.min(600, size.height) }
      });
    }
  });
});
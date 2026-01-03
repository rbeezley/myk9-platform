import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

test.describe('Registration Performance & Caching', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
  });

  test('should load registration page in under 2 seconds', async ({ page }) => {
    await testSetup.signIn('user');
    
    const startTime = Date.now();
    await page.goto('/shows/show-123/register');
    await page.waitForSelector('[data-testid="registration-step-dog-selection"]');
    const loadTime = Date.now() - startTime;
    
    // Should load in under 2 seconds
    expect(loadTime).toBeLessThan(2000);
    
    // Check performance metrics
    const metrics = await page.evaluate(() => {
      return {
        firstContentfulPaint: performance.getEntriesByType('paint')
          .find(entry => entry.name === 'first-contentful-paint')?.startTime,
        domContentLoaded: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd
      };
    });
    
    expect(metrics.firstContentfulPaint).toBeLessThan(1000);
    expect(metrics.domContentLoaded).toBeLessThan(1500);
  });

  test('should handle search with 1000+ dogs efficiently', async ({ page }) => {
    await testSetup.signIn('secretary');
    
    // Mock large dataset
    await page.route('**/api/dogs/search**', async (route) => {
      const dogs = Array.from({ length: 1000 }, (_, i) => ({
        id: `dog-${i}`,
        callName: `Dog${i}`,
        registeredName: `Registered Dog ${i}`,
        breed: i % 10 === 0 ? 'Golden Retriever' : 'Labrador',
        ownerId: `owner-${i % 100}`
      }));
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(dogs)
      });
    });
    
    await page.goto('/shows/show-123/register');
    
    // Measure search performance
    const startTime = Date.now();
    await page.fill('[data-testid="search-input"]', 'Golden');
    
    // Wait for results with virtual scrolling
    await page.waitForSelector('[data-testid="virtual-list"]');
    const searchTime = Date.now() - startTime;
    
    // Should complete search in under 500ms
    expect(searchTime).toBeLessThan(500);
    
    // Check virtual scrolling is working
    await expect(page.locator('[data-testid="virtual-list"]')).toBeVisible();
    await expect(page.locator('[data-testid="virtualized-row-0"]')).toBeVisible();
    
    // Should not render all 1000 items (only visible ones)
    const renderedItems = await page.locator('[data-testid^="virtualized-row-"]').count();
    expect(renderedItems).toBeLessThan(50); // Only visible items
    
    // Test scrolling performance
    const scrollStart = Date.now();
    await page.locator('[data-testid="virtual-list"]').scroll({ top: 5000 });
    await page.waitForSelector('[data-testid="virtualized-row-50"]');
    const scrollTime = Date.now() - scrollStart;
    
    expect(scrollTime).toBeLessThan(200);
  });

  test('should cache search results effectively', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/register');
    
    // First search - should hit API
    let apiCalls = 0;
    await page.route('**/api/dogs/search**', async (route) => {
      apiCalls++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'dog-1', callName: 'Buddy', breed: 'Golden Retriever' },
          { id: 'dog-2', callName: 'Max', breed: 'Golden Retriever' }
        ])
      });
    });
    
    const firstSearchStart = Date.now();
    await page.fill('[data-testid="search-input"]', 'Golden Retriever');
    await page.waitForSelector('[data-testid="search-results"]');
    const firstSearchTime = Date.now() - firstSearchStart;
    
    expect(apiCalls).toBe(1);
    
    // Clear search and search again - should use cache
    await page.fill('[data-testid="search-input"]', '');
    
    const secondSearchStart = Date.now();
    await page.fill('[data-testid="search-input"]', 'Golden Retriever');
    await page.waitForSelector('[data-testid="search-results"]');
    const secondSearchTime = Date.now() - secondSearchStart;
    
    // Should not make additional API call
    expect(apiCalls).toBe(1);
    
    // Cached search should be faster
    expect(secondSearchTime).toBeLessThan(firstSearchTime);
    expect(secondSearchTime).toBeLessThan(100);
    
    // Should show cache indicator
    await expect(page.locator('[data-testid="cached-results-indicator"]')).toBeVisible();
  });

  test('should maintain search performance with debouncing', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/register');
    
    let searchCalls = 0;
    await page.route('**/api/dogs/search**', async (route) => {
      searchCalls++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    
    // Type rapidly
    const searchInput = page.locator('[data-testid="search-input"]');
    await searchInput.type('Golden Retriever', { delay: 50 });
    
    // Wait for debounce period
    await page.waitForTimeout(500);
    
    // Should only make one API call due to debouncing
    expect(searchCalls).toBe(1);
    
    // Test typing and backspacing
    await searchInput.fill('Border Collie');
    await searchInput.fill('Border');
    await searchInput.fill('Bord');
    
    await page.waitForTimeout(500);
    
    // Should make only one more call
    expect(searchCalls).toBe(2);
  });

  test('should prefetch related search results', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/register');
    
    const prefetchedQueries: string[] = [];
    await page.route('**/api/dogs/search**', async (route) => {
      const url = new URL(route.request().url());
      const query = url.searchParams.get('q');
      if (query) {
        prefetchedQueries.push(query);
      }
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    
    // Search for "Golden"
    await page.fill('[data-testid="search-input"]', 'Golden');
    await page.waitForSelector('[data-testid="search-results"]');
    
    // Wait for prefetch
    await page.waitForTimeout(1000);
    
    // Should have prefetched related queries
    expect(prefetchedQueries).toContain('Golden Retriever');
    expect(prefetchedQueries).toContain('Golden Doodle');
    
    // When user types "Golden Retriever", should be instant
    const prefetchStart = Date.now();
    await page.fill('[data-testid="search-input"]', 'Golden Retriever');
    await page.waitForSelector('[data-testid="cached-results-indicator"]');
    const prefetchTime = Date.now() - prefetchStart;
    
    expect(prefetchTime).toBeLessThan(50);
  });

  test('should track search performance analytics', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/register');
    
    // Enable performance monitoring (dev mode)
    await page.evaluate(() => {
      localStorage.setItem('search_performance_monitoring', 'true');
    });
    
    await page.reload();
    
    // Should show performance monitor
    await expect(page.locator('[data-testid="search-performance-monitor"]')).toBeVisible();
    
    // Perform searches
    await page.fill('[data-testid="search-input"]', 'Golden');
    await page.waitForSelector('[data-testid="search-results"]');
    
    await page.fill('[data-testid="search-input"]', 'Border');
    await page.waitForSelector('[data-testid="search-results"]');
    
    // Check performance stats
    await expect(page.locator('[data-testid="total-searches"]')).toContainText('2');
    await expect(page.locator('[data-testid="average-response-time"]')).toBeVisible();
    await expect(page.locator('[data-testid="cache-hit-rate"]')).toBeVisible();
    
    // Should track popular queries
    await expect(page.locator('[data-testid="popular-queries"]')).toContainText('Golden');
    await expect(page.locator('[data-testid="popular-queries"]')).toContainText('Border');
  });

  test('should persist recent searches across sessions', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/register');
    
    // Perform searches
    await page.fill('[data-testid="search-input"]', 'Golden Retriever');
    await page.waitForSelector('[data-testid="search-results"]');
    
    await page.fill('[data-testid="search-input"]', 'Border Collie');
    await page.waitForSelector('[data-testid="search-results"]');
    
    // Navigate away and back
    await page.goto('/');
    await page.goto('/shows/show-123/register');
    
    // Click search input to show recent searches
    await page.click('[data-testid="search-input"]');
    
    // Should show recent searches
    await expect(page.locator('[data-testid="recent-searches"]')).toBeVisible();
    await expect(page.locator('[data-testid="recent-search-golden-retriever"]')).toBeVisible();
    await expect(page.locator('[data-testid="recent-search-border-collie"]')).toBeVisible();
    
    // Should show result counts
    await expect(page.locator('[data-testid="recent-search-results-count"]')).toBeVisible();
    
    // Clicking recent search should be instant
    const recentSearchStart = Date.now();
    await page.click('[data-testid="recent-search-golden-retriever"]');
    await page.waitForSelector('[data-testid="search-results"]');
    const recentSearchTime = Date.now() - recentSearchStart;
    
    expect(recentSearchTime).toBeLessThan(100);
  });

  test('should optimize class selection for bulk operations', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/register');
    
    // Select 20 dogs
    await page.click('[data-testid="bulk-selection-toggle"]');
    for (let i = 1; i <= 20; i++) {
      await page.click(`[data-testid="dog-card-${i}"] [data-testid="select-dog-checkbox"]`);
    }
    
    await page.click('[data-testid="next-step-button"]');
    
    // Measure bulk class application
    const bulkStart = Date.now();
    await page.click('[data-testid="bulk-operations-toggle"]');
    await page.click('[data-testid="preset-all-agility"]');
    await page.click('[data-testid="apply-to-all-button"]');
    await page.waitForSelector('[data-testid="bulk-operation-complete"]');
    const bulkTime = Date.now() - bulkStart;
    
    // Should complete bulk operation in under 2 seconds
    expect(bulkTime).toBeLessThan(2000);
    
    // Check UI responsiveness during operation
    await expect(page.locator('[data-testid="bulk-progress-indicator"]')).toBeVisible();
    await expect(page.locator('[data-testid="operation-progress"]')).toContainText('100%');
  });

  test('should handle memory efficiently with large registrations', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/register');
    
    // Monitor memory usage
    const initialMemory = await page.evaluate(() => {
      interface PerformanceWithMemory extends Performance {
        memory?: {
          usedJSHeapSize: number;
        };
      }
      return (performance as PerformanceWithMemory).memory?.usedJSHeapSize || 0;
    });
    
    // Create large registration (50 dogs)
    await page.click('[data-testid="bulk-selection-toggle"]');
    for (let i = 1; i <= 50; i++) {
      await page.click(`[data-testid="dog-card-${i}"] [data-testid="select-dog-checkbox"]`);
    }
    
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="preset-all-agility"]');
    await page.click('[data-testid="apply-to-all-button"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="next-step-button"]');
    
    const memoryAfterRegistration = await page.evaluate(() => {
      interface PerformanceWithMemory extends Performance {
        memory?: {
          usedJSHeapSize: number;
        };
      }
      return (performance as PerformanceWithMemory).memory?.usedJSHeapSize || 0;
    });
    
    // Memory increase should be reasonable (< 10MB)
    const memoryIncrease = memoryAfterRegistration - initialMemory;
    expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    
    // Complete registration
    await page.click('[data-testid="payment-method-check"]');
    await page.fill('[data-testid="check-number-input"]', '5001');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="complete-registration-button"]');
    
    // Should successfully complete large registration
    await expect(page.locator('[data-testid="bulk-registration-success"]')).toBeVisible();
    await expect(page.locator('[data-testid="registrations-created-count"]')).toContainText('50');
  });

  test('should cache handlers and armband assignments', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/register');
    
    // Complete to handler assignment
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="class-option-novice-standard"]');
    await page.click('[data-testid="next-step-button"]');
    
    // Handler assignment should be fast with caching
    const handlerStart = Date.now();
    await page.click('[data-testid="assign-professional-handler"]');
    await page.fill('[data-testid="handler-search"]', 'John');
    await page.waitForSelector('[data-testid="handler-results"]');
    const handlerSearchTime = Date.now() - handlerStart;
    
    expect(handlerSearchTime).toBeLessThan(300);
    
    // Select handler
    await page.click('[data-testid="handler-result-1"]');
    
    // Continue to payment and confirmation
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="payment-method-check"]');
    await page.fill('[data-testid="check-number-input"]', '3001');
    await page.click('[data-testid="next-step-button"]');
    
    // Armband assignment should be instant
    const armbandStart = Date.now();
    await page.click('[data-testid="armband-assignment-tab"]');
    await page.click('[data-testid="auto-assign-armbands"]');
    await page.waitForSelector('[data-testid="armband-assigned"]');
    const armbandTime = Date.now() - armbandStart;
    
    expect(armbandTime).toBeLessThan(200);
  });
});
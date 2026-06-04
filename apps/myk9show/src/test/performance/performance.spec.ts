import { test, expect } from '@playwright/test';

// Type declarations for performance APIs
interface LayoutShift extends PerformanceEntry {
  hadRecentInput: boolean;
  value: number;
}

// Performance testing utilities
class PerformanceUtils {
  static async measurePageLoad(page: import('@playwright/test').Page, url: string) {
    const startTime = Date.now();

    await page.goto(url);
    await page.waitForLoadState('networkidle');

    const endTime = Date.now();
    return endTime - startTime;
  }

  static async measureWebVitals(page: import('@playwright/test').Page) {
    return await page.evaluate(() => {
      return new Promise(resolve => {
        const vitals: Record<string, number> = {};

        // First Contentful Paint
        const fcpObserver = new PerformanceObserver(entryList => {
          const entries = entryList.getEntries();
          for (const entry of entries) {
            if (entry.name === 'first-contentful-paint') {
              vitals.fcp = entry.startTime;
            }
          }
        });
        fcpObserver.observe({ entryTypes: ['paint'] });

        // Largest Contentful Paint
        const lcpObserver = new PerformanceObserver(entryList => {
          const entries = entryList.getEntries();
          vitals.lcp = entries[entries.length - 1].startTime;
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

        // Cumulative Layout Shift
        let cls = 0;
        const clsObserver = new PerformanceObserver(entryList => {
          for (const entry of entryList.getEntries()) {
            if (!(entry as LayoutShift).hadRecentInput) {
              cls += (entry as LayoutShift).value;
            }
          }
          vitals.cls = cls;
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });

        // First Input Delay
        const fidObserver = new PerformanceObserver(entryList => {
          const firstInput = entryList.getEntries()[0];
          vitals.fid =
            (firstInput as PerformanceEventTiming).processingStart - firstInput.startTime;
        });
        fidObserver.observe({ entryTypes: ['first-input'] });

        // Wait for metrics to be collected
        setTimeout(() => {
          fcpObserver.disconnect();
          lcpObserver.disconnect();
          clsObserver.disconnect();
          fidObserver.disconnect();
          resolve(vitals);
        }, 5000);
      });
    });
  }

  static async measureResourceLoading(page: import('@playwright/test').Page) {
    return await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

      return resources.map(resource => ({
        name: resource.name,
        type: resource.initiatorType,
        duration: resource.duration,
        size: resource.transferSize,
        startTime: resource.startTime,
      }));
    });
  }

  static async measureMemoryUsage(page: import('@playwright/test').Page) {
    return await page.evaluate(() => {
      if ('memory' in performance) {
        const memory = (
          performance as Performance & {
            memory: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
          }
        ).memory;
        return {
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit,
        };
      }
      return null;
    });
  }
}

test.describe('Performance Tests', () => {
  const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

  // Performance budgets (in milliseconds)
  const PERFORMANCE_BUDGETS = {
    pageLoad: 3000,
    firstContentfulPaint: 1500,
    largestContentfulPaint: 2500,
    firstInputDelay: 100,
    cumulativeLayoutShift: 0.1,
  };

  test.describe('Page Load Performance', () => {
    test('home page loads within budget', async ({ page }) => {
      const loadTime = await PerformanceUtils.measurePageLoad(page, BASE_URL);

      expect(loadTime).toBeLessThan(PERFORMANCE_BUDGETS.pageLoad);
      console.log(`Home page load time: ${loadTime}ms`);
    });

    test('browse shows page loads within budget', async ({ page }) => {
      const loadTime = await PerformanceUtils.measurePageLoad(page, `${BASE_URL}/shows/browse`);

      expect(loadTime).toBeLessThan(PERFORMANCE_BUDGETS.pageLoad);
      console.log(`Browse shows load time: ${loadTime}ms`);
    });

    test('my shows page loads within budget', async ({ page }) => {
      const loadTime = await PerformanceUtils.measurePageLoad(page, `${BASE_URL}/my-entries`);

      expect(loadTime).toBeLessThan(PERFORMANCE_BUDGETS.pageLoad);
      console.log(`My Shows load time: ${loadTime}ms`);
    });

    test('judge dashboard loads within budget', async ({ page }) => {
      const loadTime = await PerformanceUtils.measurePageLoad(page, `${BASE_URL}/judge/dashboard`);

      expect(loadTime).toBeLessThan(PERFORMANCE_BUDGETS.pageLoad);
      console.log(`Judge dashboard load time: ${loadTime}ms`);
    });

    test('secretary dashboard loads within budget', async ({ page }) => {
      const loadTime = await PerformanceUtils.measurePageLoad(
        page,
        `${BASE_URL}/secretary/dashboard`
      );

      expect(loadTime).toBeLessThan(PERFORMANCE_BUDGETS.pageLoad);
      console.log(`Secretary dashboard load time: ${loadTime}ms`);
    });
  });

  test.describe('Web Vitals', () => {
    test('core web vitals meet standards', async ({ page }) => {
      await page.goto(`${BASE_URL}/shows/browse`);

      const vitals = await PerformanceUtils.measureWebVitals(page);

      console.log('Web Vitals:', vitals);

      // First Contentful Paint
      if (vitals.fcp) {
        expect(vitals.fcp).toBeLessThan(PERFORMANCE_BUDGETS.firstContentfulPaint);
      }

      // Largest Contentful Paint
      if (vitals.lcp) {
        expect(vitals.lcp).toBeLessThan(PERFORMANCE_BUDGETS.largestContentfulPaint);
      }

      // Cumulative Layout Shift
      if (vitals.cls !== undefined) {
        expect(vitals.cls).toBeLessThan(PERFORMANCE_BUDGETS.cumulativeLayoutShift);
      }

      // First Input Delay (if available)
      if (vitals.fid !== undefined) {
        expect(vitals.fid).toBeLessThan(PERFORMANCE_BUDGETS.firstInputDelay);
      }
    });
  });

  test.describe('Resource Loading', () => {
    test('critical resources load efficiently', async ({ page }) => {
      await page.goto(`${BASE_URL}/shows/browse`);

      const resources = await PerformanceUtils.measureResourceLoading(page);

      // Check for large resources (> 1MB)
      const largeResources = resources.filter(r => r.size > 1024 * 1024);
      console.log('Large resources:', largeResources);

      // Warn if there are large resources
      if (largeResources.length > 0) {
        console.warn(`Found ${largeResources.length} resources larger than 1MB`);
      }

      // Check for slow resources (> 2 seconds)
      const slowResources = resources.filter(r => r.duration > 2000);
      console.log('Slow resources:', slowResources);

      // Fail if critical resources are too slow
      const criticalSlowResources = slowResources.filter(
        r => r.type === 'script' || r.type === 'stylesheet'
      );
      expect(criticalSlowResources.length).toBe(0);
    });

    test('images are optimized', async ({ page }) => {
      await page.goto(`${BASE_URL}/shows/browse`);

      const resources = await PerformanceUtils.measureResourceLoading(page);
      const images = resources.filter(r => r.type === 'img');

      console.log(`Found ${images.length} images`);

      // Check for very large images (> 500KB)
      const largeImages = images.filter(img => img.size > 500 * 1024);

      if (largeImages.length > 0) {
        console.warn(`Found ${largeImages.length} images larger than 500KB:`, largeImages);
      }

      // Should have reasonable number of large images
      expect(largeImages.length).toBeLessThan(3);
    });
  });

  test.describe('Memory Usage', () => {
    test('memory usage remains reasonable', async ({ page }) => {
      await page.goto(`${BASE_URL}/shows/browse`);

      const initialMemory = await PerformanceUtils.measureMemoryUsage(page);

      if (initialMemory) {
        console.log('Initial memory usage:', initialMemory);

        // Navigate through several pages to check for memory leaks
        await page.goto(`${BASE_URL}/my-entries`);
        await page.goto(`${BASE_URL}/judge/dashboard`);
        await page.goto(`${BASE_URL}/secretary/dashboard`);
        await page.goto(`${BASE_URL}/shows/browse`);

        const finalMemory = await PerformanceUtils.measureMemoryUsage(page);
        console.log('Final memory usage:', finalMemory);

        if (finalMemory) {
          const memoryIncrease = finalMemory.usedJSHeapSize - initialMemory.usedJSHeapSize;
          const memoryIncreasePercent = (memoryIncrease / initialMemory.usedJSHeapSize) * 100;

          console.log(
            `Memory increase: ${memoryIncrease} bytes (${memoryIncreasePercent.toFixed(2)}%)`
          );

          // Memory should not increase by more than 50% during navigation
          expect(memoryIncreasePercent).toBeLessThan(50);
        }
      }
    });
  });

  test.describe('Search Performance', () => {
    test('search results load quickly', async ({ page }) => {
      await page.goto(`${BASE_URL}/shows/browse`);

      // Measure search input response time
      const startTime = Date.now();

      await page.locator('[data-testid="search-input"]').fill('agility');
      await page.locator('[data-testid="search-button"]').click();

      // Wait for results to appear
      await expect(page.locator('[data-testid="search-results"]')).toBeVisible();

      const searchTime = Date.now() - startTime;
      console.log(`Search completed in: ${searchTime}ms`);

      // Search should complete within 1 second
      expect(searchTime).toBeLessThan(1000);
    });

    test('search suggestions appear quickly', async ({ page }) => {
      await page.goto(`${BASE_URL}/shows/browse`);

      const startTime = Date.now();

      await page.locator('[data-testid="search-input"]').fill('agil');

      // Wait for suggestions to appear
      await expect(page.locator('[data-testid="search-suggestions"]')).toBeVisible();

      const suggestionTime = Date.now() - startTime;
      console.log(`Suggestions appeared in: ${suggestionTime}ms`);

      // Suggestions should appear within 300ms
      expect(suggestionTime).toBeLessThan(300);
    });
  });

  test.describe('Notification Performance', () => {
    test('notification center loads quickly', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-entries`);

      const startTime = Date.now();

      await page.locator('[data-testid="notification-button"]').click();

      // Wait for notification center to open
      await expect(page.locator('[data-testid="notification-center"]')).toBeVisible();

      const loadTime = Date.now() - startTime;
      console.log(`Notification center opened in: ${loadTime}ms`);

      // Should open within 200ms
      expect(loadTime).toBeLessThan(200);
    });

    test('notification filtering is responsive', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-entries`);

      await page.locator('[data-testid="notification-button"]').click();
      await expect(page.locator('[data-testid="notification-center"]')).toBeVisible();

      const startTime = Date.now();

      await page.locator('[data-testid="filter-dropdown"]').selectOption('announcements');

      // Wait for filtered results
      await page.waitForTimeout(100); // Small delay to ensure filtering completes

      const filterTime = Date.now() - startTime;
      console.log(`Filtering completed in: ${filterTime}ms`);

      // Filtering should be nearly instantaneous
      expect(filterTime).toBeLessThan(100);
    });
  });

  test.describe('Component Rendering Performance', () => {
    test('large lists render efficiently', async ({ page }) => {
      await page.goto(`${BASE_URL}/shows/browse`);

      // Measure time to render show list
      const startTime = Date.now();

      await expect(page.locator('[data-testid="show-card"]').first()).toBeVisible();

      const renderTime = Date.now() - startTime;
      console.log(`Show list rendered in: ${renderTime}ms`);

      // Should render within 500ms
      expect(renderTime).toBeLessThan(500);
    });

    test('entry management table renders efficiently', async ({ page }) => {
      await page.goto(`${BASE_URL}/secretary/entry-management`);

      const startTime = Date.now();

      await expect(page.locator('[data-testid="entry-row"]').first()).toBeVisible();

      const renderTime = Date.now() - startTime;
      console.log(`Entry table rendered in: ${renderTime}ms`);

      // Should render within 500ms
      expect(renderTime).toBeLessThan(500);
    });
  });

  test.describe('Offline Performance', () => {
    test('cached pages load quickly when offline', async ({ page, context }) => {
      // Load page online first
      await page.goto(`${BASE_URL}/my-entries`);
      await expect(page.locator('h1')).toContainText('My Shows');

      // Go offline
      await context.setOffline(true);

      const startTime = Date.now();

      // Reload page (should come from cache)
      await page.reload();
      await expect(page.locator('h1')).toContainText('My Shows');

      const loadTime = Date.now() - startTime;
      console.log(`Offline page load time: ${loadTime}ms`);

      // Cached pages should load very quickly
      expect(loadTime).toBeLessThan(1000);
    });
  });
});

test.describe('Stress Tests', () => {
  const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

  test('app handles rapid navigation', async ({ page }) => {
    const pages = [
      `${BASE_URL}/shows/browse`,
      `${BASE_URL}/my-entries`,
      `${BASE_URL}/judge/dashboard`,
      `${BASE_URL}/secretary/dashboard`,
      `${BASE_URL}/calendar`,
    ];

    const startTime = Date.now();

    // Rapidly navigate between pages
    for (let i = 0; i < 3; i++) {
      for (const pageUrl of pages) {
        await page.goto(pageUrl);
        // Wait for page to start loading but don't wait for full load
        await page.waitForSelector('h1', { timeout: 5000 });
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`Rapid navigation completed in: ${totalTime}ms`);

    // Should handle rapid navigation without crashes
    expect(page.isClosed()).toBe(false);
  });

  test('search handles rapid typing', async ({ page }) => {
    await page.goto(`${BASE_URL}/shows/browse`);

    const searchTerms = [
      'a',
      'ag',
      'agi',
      'agil',
      'agili',
      'agilit',
      'agility',
      'agility ',
      'agility c',
      'agility ch',
      'agility cha',
      'agility cham',
      'agility champ',
      'agility champi',
      'agility champio',
      'agility champion',
    ];

    const startTime = Date.now();

    // Rapidly type search terms
    const searchInput = page.locator('[data-testid="search-input"]');

    for (const term of searchTerms) {
      await searchInput.fill(term);
      await page.waitForTimeout(50); // Small delay between types
    }

    const typingTime = Date.now() - startTime;
    console.log(`Rapid typing completed in: ${typingTime}ms`);

    // Should handle rapid typing without crashes or excessive lag
    expect(typingTime).toBeLessThan(2000);
  });

  test('notification center handles many notifications', async ({ page }) => {
    await page.goto(`${BASE_URL}/my-entries`);

    // Simulate receiving many notifications rapidly
    await page.evaluate(() => {
      // This would normally be done through the notification service
      // For testing, we'll just verify the UI can handle rapid updates
      for (let i = 0; i < 50; i++) {
        const event = new CustomEvent('notification', {
          detail: {
            id: `test-${i}`,
            title: `Test Notification ${i}`,
            body: `This is test notification number ${i}`,
            timestamp: new Date(),
          },
        });
        window.dispatchEvent(event);
      }
    });

    // Open notification center
    await page.locator('[data-testid="notification-button"]').click();
    await expect(page.locator('[data-testid="notification-center"]')).toBeVisible();

    // Should handle many notifications without significant lag
    const startTime = Date.now();
    await expect(page.locator('[data-testid="notification-item"]')).toHaveCount.toBeGreaterThan(0);
    const renderTime = Date.now() - startTime;

    expect(renderTime).toBeLessThan(1000);
  });
});

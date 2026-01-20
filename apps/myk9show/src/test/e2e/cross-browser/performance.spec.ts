import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';
import { VisualTestHelper } from '../helpers/visualTestHelper';

test.describe('Cross-Browser Performance Tests', () => {
  let testSetup: TestSetup;
  let visualHelper: VisualTestHelper;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    visualHelper = new VisualTestHelper(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
  });

  test.describe('Page Load Performance', () => {
    ['chromium', 'firefox', 'webkit'].forEach(browserName => {
      test(`homepage load performance in ${browserName}`, async ({ page, browserName: currentBrowser }) => {
        test.skip(browserName !== currentBrowser, `Skipping ${browserName} test in ${currentBrowser}`);
        
        const startTime = Date.now();
        
        // Start navigation and capture metrics
        const [response] = await Promise.all([
          page.waitForResponse(response => response.url().includes('localhost:5173') && response.status() === 200),
          page.goto('/', { waitUntil: 'networkidle' })
        ]);
        
        const loadTime = Date.now() - startTime;
        
        // Verify response
        expect(response.status()).toBe(200);
        
        // Check performance metrics
        const performanceMetrics = await page.evaluate(() => {
          const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          return {
            domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
            loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
            firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0,
            domInteractive: navigation.domInteractive - navigation.navigationStart,
            totalLoadTime: navigation.loadEventEnd - navigation.navigationStart
          };
        });
        
        // Performance assertions (adjusted for cross-browser differences)
        const browserThresholds = {
          chromium: { load: 3000, interactive: 2000 },
          firefox: { load: 4000, interactive: 2500 },
          webkit: { load: 4500, interactive: 3000 }
        };
        
        const threshold = browserThresholds[browserName as keyof typeof browserThresholds] || browserThresholds.chromium;
        
        expect(loadTime).toBeLessThan(threshold.load);
        expect(performanceMetrics.domInteractive).toBeLessThan(threshold.interactive);
        expect(performanceMetrics.totalLoadTime).toBeGreaterThan(0);
        
        console.log(`${browserName} Performance Metrics:`, {
          loadTime,
          ...performanceMetrics
        });
      });
    });

    test('dashboard load performance comparison', async ({ page, browserName }) => {
      await testSetup.signIn('user');
      
      const startTime = Date.now();
      await page.goto('/', { waitUntil: 'networkidle' });
      await visualHelper.waitForPageLoad();
      const loadTime = Date.now() - startTime;
      
      // Check that dashboard elements are loaded
      await expect(page.locator('[data-testid="dashboard-content"]')).toBeVisible();
      await expect(page.locator('[data-testid="navigation-sidebar"]')).toBeVisible();
      
      // Browser-specific performance expectations
      const maxLoadTime = browserName === 'webkit' ? 5000 : 
                         browserName === 'firefox' ? 4000 : 3000;
      
      expect(loadTime).toBeLessThan(maxLoadTime);
      
      // Check for performance-critical elements
      const criticalElements = [
        '[data-testid="user-avatar"]',
        '[data-testid="main-navigation"]',
        '[data-testid="dashboard-stats"]'
      ];
      
      for (const selector of criticalElements) {
        await expect(page.locator(selector)).toBeVisible({ timeout: 2000 });
      }
    });
  });

  test.describe('JavaScript Execution Performance', () => {
    test('form interaction performance', async ({ page, browserName }) => {
      await testSetup.signIn('user');
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      // Measure form interaction performance
      const interactionStart = Date.now();
      
      await page.fill('[data-testid="dog-call-name"]', 'Performance Test Dog');
      await page.selectOption('[data-testid="dog-breed"]', 'Golden Retriever');
      await page.fill('[data-testid="dog-birth-date"]', '2020-01-15');
      
      const interactionTime = Date.now() - interactionStart;
      
      // Browser-specific thresholds
      const maxInteractionTime = browserName === 'webkit' ? 1000 : 500;
      expect(interactionTime).toBeLessThan(maxInteractionTime);
      
      // Verify form responsiveness
      await expect(page.locator('[data-testid="dog-call-name"]')).toHaveValue('Performance Test Dog');
      await expect(page.locator('[data-testid="dog-breed"]')).toHaveValue('Golden Retriever');
    });

    test('table rendering performance', async ({ page, browserName }) => {
      await testSetup.signIn('secretary');
      await visualHelper.mockEntriesTableData();
      
      const renderStart = Date.now();
      await page.goto('/secretary/entries');
      await visualHelper.waitForPageLoad();
      
      // Wait for table to be fully rendered
      await expect(page.locator('[data-testid="entries-table"] tbody tr')).toHaveCount(3);
      const renderTime = Date.now() - renderStart;
      
      // Browser-specific rendering thresholds
      const maxRenderTime = browserName === 'webkit' ? 2500 : 
                           browserName === 'firefox' ? 2000 : 1500;
      
      expect(renderTime).toBeLessThan(maxRenderTime);
      
      // Verify table functionality
      await expect(page.locator('[data-testid="entries-table"]')).toBeVisible();
      await expect(page.locator('tbody tr')).toHaveCount(3);
    });
  });

  test.describe('Memory Usage Patterns', () => {
    test('navigation memory stability', async ({ page, browserName }) => {
      await testSetup.signIn('user');
      
      // Navigate through multiple pages to test memory usage
      const pages = ['/', '/dogs', '/shows', '/dogs/add', '/'];
      
      for (const pagePath of pages) {
        await page.goto(pagePath);
        await visualHelper.waitForPageLoad();
        
        // Check memory usage (simplified check)
        const memoryInfo = await page.evaluate(() => {
          const perfWithMemory = performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } };
          return perfWithMemory.memory ? {
            usedJSHeapSize: perfWithMemory.memory.usedJSHeapSize,
            totalJSHeapSize: perfWithMemory.memory.totalJSHeapSize,
            jsHeapSizeLimit: perfWithMemory.memory.jsHeapSizeLimit
          } : null;
        });
        
        if (memoryInfo && browserName === 'chromium') {
          // Memory checks only work reliably in Chromium
          expect(memoryInfo.usedJSHeapSize).toBeLessThan(50 * 1024 * 1024); // 50MB limit
          expect(memoryInfo.usedJSHeapSize).toBeGreaterThan(0);
        }
        
        // Verify page is functional
        await expect(page.locator('body')).toBeVisible();
      }
    });
  });

  test.describe('Network Performance', () => {
    test('API response handling', async ({ page, browserName }) => {
      await testSetup.signIn('user');
      await visualHelper.mockDogListData();
      
      // Measure API response handling
      const networkStart = Date.now();
      
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      await expect(page.locator('[data-testid="dog-card"]')).toHaveCount(3);
      
      const networkTime = Date.now() - networkStart;
      
      // Browser-specific network thresholds
      const maxNetworkTime = browserName === 'webkit' ? 3000 : 2000;
      expect(networkTime).toBeLessThan(maxNetworkTime);
      
      // Verify data is properly loaded
      await expect(page.locator('[data-testid="dog-card"]').first()).toContainText('Buddy');
    });

    test('concurrent request handling', async ({ page, browserName }) => {
      await testSetup.signIn('secretary');
      
      // Mock multiple data sources
      await visualHelper.mockShowListData();
      await visualHelper.mockEntriesTableData();
      
      const concurrentStart = Date.now();
      
      // Navigate to page that loads multiple resources
      await page.goto('/secretary/dashboard');
      await visualHelper.waitForPageLoad();
      
      const concurrentTime = Date.now() - concurrentStart;
      
      // Browser-specific concurrent request thresholds
      const maxConcurrentTime = browserName === 'webkit' ? 4000 : 
                               browserName === 'firefox' ? 3000 : 2500;
      
      expect(concurrentTime).toBeLessThan(maxConcurrentTime);
      
      // Verify multiple data sources loaded
      await expect(page.locator('[data-testid="dashboard-content"]')).toBeVisible();
    });
  });

  test.describe('Core Web Vitals', () => {
    test('Largest Contentful Paint (LCP)', async ({ page, browserName }) => {
      await page.goto('/', { waitUntil: 'networkidle' });
      
      const lcp = await page.evaluate(() => {
        return new Promise<number>((resolve) => {
          new PerformanceObserver((entryList) => {
            const entries = entryList.getEntries();
            const lastEntry = entries[entries.length - 1];
            resolve(lastEntry.startTime);
          }).observe({ entryTypes: ['largest-contentful-paint'] });
          
          // Fallback timeout
          setTimeout(() => resolve(0), 5000);
        });
      });
      
      // Browser-specific LCP thresholds
      const maxLCP = browserName === 'webkit' ? 3000 : 2500;
      
      if (lcp > 0) {
        expect(lcp).toBeLessThan(maxLCP);
        console.log(`${browserName} LCP: ${lcp}ms`);
      }
    });

    test('Cumulative Layout Shift (CLS)', async ({ page, browserName }) => {
      await page.goto('/', { waitUntil: 'networkidle' });
      await visualHelper.waitForPageLoad();
      
      const cls = await page.evaluate(() => {
        return new Promise<number>((resolve) => {
          let clsValue = 0;

          new PerformanceObserver((entryList) => {
            for (const entry of entryList.getEntries()) {
              const layoutShiftEntry = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
              if (!layoutShiftEntry.hadRecentInput) {
                clsValue += layoutShiftEntry.value ?? 0;
              }
            }
          }).observe({ entryTypes: ['layout-shift'] });

          setTimeout(() => resolve(clsValue), 3000);
        });
      });
      
      // CLS should be minimal for good UX
      expect(cls).toBeLessThan(0.1);
      console.log(`${browserName} CLS: ${cls}`);
    });
  });

  test.describe('Resource Loading', () => {
    test('CSS and font loading performance', async ({ page, browserName }) => {
      const startTime = Date.now();
      
      await page.goto('/', { waitUntil: 'networkidle' });
      
      // Wait for fonts to load
      await page.waitForFunction(() => document.fonts.ready);
      
      const fontLoadTime = Date.now() - startTime;
      
      // Browser-specific font loading thresholds
      const maxFontLoadTime = browserName === 'webkit' ? 2000 : 1500;
      expect(fontLoadTime).toBeLessThan(maxFontLoadTime);
      
      // Verify CSS is applied correctly
      const computedStyle = await page.evaluate(() => {
        const body = document.body;
        const style = window.getComputedStyle(body);
        return {
          fontFamily: style.fontFamily,
          backgroundColor: style.backgroundColor
        };
      });
      
      expect(computedStyle.fontFamily).toBeTruthy();
      expect(computedStyle.backgroundColor).toBeTruthy();
    });

    test('image loading performance', async ({ page, browserName: _browserName }) => {
      await testSetup.signIn('user');
      await page.goto('/');
      await visualHelper.waitForPageLoad();
      
      // Check if images are loaded efficiently
      const imageMetrics = await page.evaluate(() => {
        const images = Array.from(document.images);
        return images.map(img => ({
          src: img.src,
          complete: img.complete,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight
        }));
      });
      
      // Verify images are loaded
      for (const img of imageMetrics) {
        if (img.src) {
          expect(img.complete).toBe(true);
          expect(img.naturalWidth).toBeGreaterThan(0);
          expect(img.naturalHeight).toBeGreaterThan(0);
        }
      }
    });
  });
});
/**
 * Performance measurement script using Playwright
 * Captures key loading metrics including LCP, FCP, and total load time
 */

import { chromium, Browser, Page } from '@playwright/test';
import { logger } from '@/services/LoggingService';

interface PerformanceMetrics {
  navigationStart: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  domContentLoaded: number;
  loadEventEnd: number;
  totalBlockingTime: number;
  memoryUsage?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
  };
}

async function measurePerformance(url: string): Promise<PerformanceMetrics> {
  const browser: Browser = await chromium.launch({
    headless: false, // Set to true for CI/CD
    args: ['--enable-precise-memory-info']
  });
  
  const context = await browser.newContext();
  const page: Page = await context.newPage();
  
  // Enable performance tracking
  await context.addInitScript(() => {
    window.performanceMetrics = {
      marks: [],
      measures: []
    };
  });

  // Navigate and wait for load
  const navigationPromise = page.goto(url, { 
    waitUntil: 'networkidle',
    timeout: 30000 
  });
  
  await navigationPromise;
  
  // Wait a bit for any lazy loading to complete
  await page.waitForTimeout(2000);
  
  // Collect performance metrics
  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const paintEntries = performance.getEntriesByType('paint');
    
    // Get FCP and LCP
    const fcp = paintEntries.find(entry => entry.name === 'first-contentful-paint');
    let lcp = 0;
    
    // Try to get LCP from PerformanceObserver entries
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
    if (lcpEntries.length > 0) {
      lcp = lcpEntries[lcpEntries.length - 1].startTime;
    }
    
    // Calculate Total Blocking Time (approximation)
    let tbt = 0;
    const longTasks = performance.getEntriesByType('longtask');
    longTasks.forEach(task => {
      const blockingTime = task.duration - 50; // Tasks over 50ms are considered blocking
      if (blockingTime > 0) {
        tbt += blockingTime;
      }
    });
    
    // Get memory usage if available
    let memoryUsage;
    const perfWithMemory = performance as Performance & { 
      memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
      };
    };
    if (perfWithMemory.memory) {
      memoryUsage = {
        usedJSHeapSize: perfWithMemory.memory.usedJSHeapSize,
        totalJSHeapSize: perfWithMemory.memory.totalJSHeapSize
      };
    }
    
    return {
      navigationStart: navigation.startTime,
      firstContentfulPaint: fcp ? fcp.startTime : 0,
      largestContentfulPaint: lcp,
      domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
      loadEventEnd: navigation.loadEventEnd,
      totalBlockingTime: tbt,
      memoryUsage
    };
  });
  
  await browser.close();
  return metrics;
}

async function runPerformanceTests() {
  logger.debug('🚀 Starting Performance Measurements...\n', 'app', {});
  
  const urls = [
    { name: 'Home Page', url: 'http://localhost:5173/' },
    { name: 'Dogs Page', url: 'http://localhost:5173/dogs' },
    { name: 'Users Page', url: 'http://localhost:5173/people' },
    { name: 'Shows Page', url: 'http://localhost:5173/shows' },
  ];
  
  for (const test of urls) {
    logger.debug(`📊 Measuring: ${test.name}`, 'app', {});
    logger.debug(''─'.repeat(50)', 'test', { '─'.repeat(50): '─'.repeat(50) });
    
    try {
      const metrics = await measurePerformance(test.url);
      
      logger.debug(`✅ First Contentful Paint (FCP): ${metrics.firstContentfulPaint.toFixed(2)}ms`, 'app', {});
      logger.debug(`✅ Largest Contentful Paint (LCP): ${metrics.largestContentfulPaint.toFixed(2)}ms`, 'app', {});
      logger.debug(`✅ DOM Content Loaded: ${metrics.domContentLoaded.toFixed(2)}ms`, 'app', {});
      logger.debug(`✅ Page Load Complete: ${metrics.loadEventEnd.toFixed(2)}ms`, 'app', {});
      logger.debug(`⚠️  Total Blocking Time: ${metrics.totalBlockingTime.toFixed(2)}ms`, 'app', {});
      
      if (metrics.memoryUsage) {
        const usedMB = (metrics.memoryUsage.usedJSHeapSize / 1024 / 1024).toFixed(2);
        const totalMB = (metrics.memoryUsage.totalJSHeapSize / 1024 / 1024).toFixed(2);
        logger.debug(`💾 Memory Usage: ${usedMB}MB / ${totalMB}MB`, 'app', {});
      }
      
      logger.debug('\n', 'app', {});
      
      // Add delay between tests
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      logger.error(`❌ Error measuring ${test.name}:`, 'app', {}, error as Error);
      logger.debug('\n', 'app', {});
    }
  }
  
  logger.debug('✨ Performance measurements complete!', 'app', {});
}

// Run the tests if called directly
if (require.main === module) {
  runPerformanceTests().catch((err) => logger.error('Error', 'test', {}, err as Error));
}

export { measurePerformance, runPerformanceTests };
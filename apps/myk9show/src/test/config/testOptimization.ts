/**
 * Test optimization configuration
 * Reduces timeouts and improves test infrastructure efficiency
 */

import { beforeEach, afterEach, vi } from 'vitest';

/**
 * Optimized timeout configurations for different test types
 */
export const TIMEOUT_CONFIG = {
  // Unit tests should be fast
  unit: 5000, // 5 seconds
  
  // Integration tests can take longer
  integration: 15000, // 15 seconds
  
  // E2E tests need more time but not excessive
  e2e: 30000, // 30 seconds
  
  // Database operations
  database: 10000, // 10 seconds
  
  // Network operations
  network: 8000, // 8 seconds
} as const;

/**
 * Test performance monitoring
 */
export interface TestMetrics {
  testName: string;
  duration: number;
  category: keyof typeof TIMEOUT_CONFIG;
  status: 'passed' | 'failed' | 'skipped';
  issues?: string[];
}

const testMetrics: TestMetrics[] = [];

/**
 * Performance monitor for tests
 */
export const performanceMonitor = {
  start: (testName: string, category: keyof typeof TIMEOUT_CONFIG) => {
    const startTime = performance.now();
    return {
      end: (status: TestMetrics['status'], issues?: string[]) => {
        const duration = performance.now() - startTime;
        const metric: TestMetrics = {
          testName,
          duration,
          category,
          status,
          issues,
        };
        
        testMetrics.push(metric);
        
        // Warn about slow tests
        const threshold = TIMEOUT_CONFIG[category] * 0.8; // 80% of timeout
        if (duration > threshold) {
          console.warn(`⚠️ Slow test: ${testName} took ${duration.toFixed(2)}ms (>${threshold.toFixed(2)}ms)`);
        }
        
        return metric;
      }
    };
  },
  
  getMetrics: () => [...testMetrics],
  
  reset: () => {
    testMetrics.length = 0;
  },
  
  getSummary: () => {
    const totalTests = testMetrics.length;
    const passed = testMetrics.filter(m => m.status === 'passed').length;
    const failed = testMetrics.filter(m => m.status === 'failed').length;
    const skipped = testMetrics.filter(m => m.status === 'skipped').length;
    const avgDuration = testMetrics.reduce((sum, m) => sum + m.duration, 0) / totalTests;
    
    const slowTests = testMetrics.filter(m => {
      const threshold = TIMEOUT_CONFIG[m.category] * 0.8;
      return m.duration > threshold;
    });
    
    return {
      totalTests,
      passed,
      failed,
      skipped,
      avgDuration,
      slowTestsCount: slowTests.length,
      slowTests: slowTests.map(t => ({ name: t.testName, duration: t.duration })),
    };
  }
};

/**
 * React rendering loop detection and prevention
 */
export const renderingLoopPrevention = {
  maxRenders: 100, // Maximum renders before we consider it a loop
  renderCounts: new Map<string, number>(),
  
  trackRender: (componentName: string) => {
    const current = renderingLoopPrevention.renderCounts.get(componentName) || 0;
    const newCount = current + 1;
    
    if (newCount > renderingLoopPrevention.maxRenders) {
      const error = new Error(`Possible infinite render loop detected in ${componentName} (${newCount} renders)`);
      console.error(error);
      throw error;
    }
    
    renderingLoopPrevention.renderCounts.set(componentName, newCount);
    return newCount;
  },
  
  reset: (componentName?: string) => {
    if (componentName) {
      renderingLoopPrevention.renderCounts.delete(componentName);
    } else {
      renderingLoopPrevention.renderCounts.clear();
    }
  }
};

/**
 * Memory leak detection for React components
 */
export const memoryLeakDetection = {
  activeComponents: new Set<string>(),
  
  register: (componentName: string) => {
    memoryLeakDetection.activeComponents.add(componentName);
  },
  
  unregister: (componentName: string) => {
    memoryLeakDetection.activeComponents.delete(componentName);
  },
  
  checkLeaks: () => {
    const leakCount = memoryLeakDetection.activeComponents.size;
    if (leakCount > 50) { // Arbitrary threshold
      console.warn(`⚠️ Possible memory leak: ${leakCount} components still registered`);
      console.warn('Active components:', Array.from(memoryLeakDetection.activeComponents));
    }
    return leakCount;
  },
  
  reset: () => {
    memoryLeakDetection.activeComponents.clear();
  }
};

/**
 * Test cleanup utilities
 */
export const testCleanup = {
  cleanup: () => {
    // Clear all timers
    vi.clearAllTimers();
    
    // Reset all mocks
    vi.clearAllMocks();
    
    // Reset render tracking
    renderingLoopPrevention.reset();
    memoryLeakDetection.reset();
    
    // Clear localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    
    // Clear sessionStorage
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
  },
  
  setupGlobalCleanup: () => {
    beforeEach(() => {
      renderingLoopPrevention.reset();
    });
    
    afterEach(() => {
      testCleanup.cleanup();
      memoryLeakDetection.checkLeaks();
    });
  }
};

/**
 * Test timeout wrapper with category-based timeouts
 */
export const withTimeout = <T extends (...args: unknown[]) => unknown>(
  testFn: T,
  category: keyof typeof TIMEOUT_CONFIG = 'unit'
): T => {
  return ((...args: Parameters<T>) => {
    const timeout = TIMEOUT_CONFIG[category];
    return Promise.race([
      Promise.resolve(testFn(...args)),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Test timed out after ${timeout}ms (${category} test)`));
        }, timeout);
      })
    ]);
  }) as T;
};

/**
 * Batch test runner for reducing overhead
 */
export const batchTestRunner = {
  queue: [] as Array<() => Promise<unknown>>,
  
  add: (testFn: () => Promise<unknown>) => {
    batchTestRunner.queue.push(testFn);
  },
  
  run: async (batchSize = 5) => {
    const results = [];
    
    for (let i = 0; i < batchTestRunner.queue.length; i += batchSize) {
      const batch = batchTestRunner.queue.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(batch.map(fn => fn()));
      results.push(...batchResults);
    }
    
    batchTestRunner.queue.length = 0; // Clear queue
    return results;
  }
};

// Export test helper that combines all optimizations
export const optimizedTest = {
  timeout: TIMEOUT_CONFIG,
  monitor: performanceMonitor,
  renderLoop: renderingLoopPrevention,
  memoryLeak: memoryLeakDetection,
  cleanup: testCleanup,
  withTimeout,
  batch: batchTestRunner,
};

export default optimizedTest;
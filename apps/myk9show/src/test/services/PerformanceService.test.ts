import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock audit service before any imports that use it
vi.mock('../../services/AuditService', () => ({
  auditService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock LoggingService before any imports that use it
vi.mock('../../services/LoggingService', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Store references to instances created by MockPerformanceObserver so tests can trigger callbacks
let performanceObserverInstances: MockPerformanceObserver[] = [];

class MockPerformanceObserver {
  private callback: (entryList: { getEntries: () => unknown[] }) => void;
  private _entryTypes: string[] = [];

  constructor(callback: (entryList: { getEntries: () => unknown[] }) => void) {
    this.callback = callback;
    performanceObserverInstances.push(this);
  }

  observe(options?: { entryTypes?: string[] }) {
    if (options?.entryTypes) {
      this._entryTypes = options.entryTypes;
    }
  }

  disconnect() {}

  get entryTypes() {
    return this._entryTypes;
  }

  triggerEntries(entries: unknown[]) {
    this.callback({ getEntries: () => entries });
  }
}

const mockMemory = {
  usedJSHeapSize: 10000000,
  totalJSHeapSize: 20000000,
  jsHeapSizeLimit: 50000000,
};

const mockPerformance = {
  now: vi.fn(() => Date.now()),
  getEntriesByType: vi.fn().mockReturnValue([]),
  mark: vi.fn(),
  measure: vi.fn(),
  clearMarks: vi.fn(),
  clearMeasures: vi.fn(),
  memory: mockMemory,
};

Object.defineProperty(globalThis, 'performance', {
  value: mockPerformance,
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, 'PerformanceObserver', {
  value: MockPerformanceObserver,
  writable: true,
  configurable: true,
});

Object.defineProperty(navigator, 'connection', {
  value: {
    effectiveType: '4g',
    downlink: 10,
    rtt: 50,
    saveData: false,
  },
  writable: true,
  configurable: true,
});

Object.defineProperty(document, 'readyState', {
  value: 'complete',
  writable: true,
  configurable: true,
});

// Static imports - vi.mock calls are hoisted before these
import { PerformanceService } from '../../services/PerformanceService';
import { auditService } from '../../services/AuditService';

describe('PerformanceService', () => {
  let service: PerformanceService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    performanceObserverInstances = [];

    // Re-apply performance mock AFTER fake timers (vi.useFakeTimers replaces global performance)
    Object.defineProperty(globalThis, 'performance', {
      value: mockPerformance,
      writable: true,
      configurable: true,
    });

    // Reset performance mock defaults
    mockPerformance.getEntriesByType.mockReturnValue([]);
    mockPerformance.now.mockImplementation(() => Date.now());

    // Re-assign memory in case a prior test deleted it
    (mockPerformance as Record<string, unknown>).memory = mockMemory;

    // Re-assign PerformanceObserver in case a prior test deleted it
    Object.defineProperty(globalThis, 'PerformanceObserver', {
      value: MockPerformanceObserver,
      writable: true,
      configurable: true,
    });

    // Re-assign navigator.connection in case a prior test deleted it
    Object.defineProperty(navigator, 'connection', {
      value: {
        effectiveType: '4g',
        downlink: 10,
        rtt: 50,
        saveData: false,
      },
      writable: true,
      configurable: true,
    });

    // Create fresh service instance (no dynamic import needed - vi.mock is hoisted)
    service = new PerformanceService();
    // Constructor calls initializeMonitoring() which starts setInterval for memory monitoring.
    // Do NOT advance timers here - we don't want to trigger the interval loop.
  });

  afterEach(() => {
    service.stopMonitoring();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /**
   * Helper: call collectMetrics and advance fake timers so the internal
   * 5-second setTimeout calls in getFirstInputDelay, getCumulativeLayoutShift,
   * and getLargestContentfulPaint resolve. These are awaited sequentially,
   * so we need 3 × 5s = 15s+ of timer advancement. Uses 16s which is
   * safely under the 30s memory monitoring interval.
   */
  async function collectMetricsWithTimers() {
    const promise = service.collectMetrics();
    await vi.advanceTimersByTimeAsync(16000);
    return promise;
  }

  describe('metrics collection', () => {
    it('should collect basic performance metrics', async () => {
      mockPerformance.getEntriesByType.mockImplementation((type: string) => {
        if (type === 'navigation') {
          return [{
            fetchStart: 1000,
            loadEventEnd: 4000,
            domContentLoadedEventEnd: 3000,
          }];
        }
        if (type === 'paint') {
          return [
            { name: 'first-contentful-paint', startTime: 1500 },
          ];
        }
        if (type === 'resource') {
          return [
            {
              name: 'https://example.com/script.js',
              initiatorType: 'script',
              duration: 500,
              transferSize: 1024,
              startTime: 1200,
            },
          ];
        }
        return [];
      });

      const metrics = await collectMetricsWithTimers();

      expect(metrics.pageLoadTime).toBe(3000);
      expect(metrics.firstContentfulPaint).toBe(1500);
      expect(metrics.resourceLoadTimes).toHaveLength(1);
      expect(metrics.resourceLoadTimes[0].name).toBe('https://example.com/script.js');
      expect(metrics.memoryUsage).toBeDefined();
      expect(metrics.connectionInfo).toBeDefined();
    });

    it('should handle missing performance data gracefully', async () => {
      mockPerformance.getEntriesByType.mockReturnValue([]);

      const metrics = await collectMetricsWithTimers();

      expect(metrics.pageLoadTime).toBe(0);
      expect(metrics.firstContentfulPaint).toBe(0);
      expect(metrics.resourceLoadTimes).toHaveLength(0);
    });

    it('should collect memory usage information', async () => {
      const metrics = await collectMetricsWithTimers();

      expect(metrics.memoryUsage).toEqual({
        usedJSHeapSize: 10000000,
        totalJSHeapSize: 20000000,
        jsHeapSizeLimit: 50000000,
      });
    });

    it('should collect connection information', async () => {
      const metrics = await collectMetricsWithTimers();

      expect(metrics.connectionInfo).toEqual({
        effectiveType: '4g',
        downlink: 10,
        rtt: 50,
        saveData: false,
      });
    });
  });

  describe('page load measurement', () => {
    it('should measure page load time when document is ready', async () => {
      let callCount = 0;
      mockPerformance.now.mockImplementation(() => {
        callCount++;
        return callCount <= 1 ? 1000 : 3000;
      });

      // document.readyState is 'complete' so measurePageLoad resolves synchronously
      await service.measurePageLoad('test-page');

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'performance_metric',
          metadata: expect.objectContaining({
            type: 'page_load',
            pageId: 'test-page',
          }),
        })
      );
    });

    it('should handle already loaded document', async () => {
      Object.defineProperty(document, 'readyState', { value: 'complete', writable: true, configurable: true });

      await service.measurePageLoad('already-loaded');

      expect(auditService.log).toHaveBeenCalled();
    });
  });

  describe('async operation measurement', () => {
    it('should measure successful async operation', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success');
      let callCount = 0;
      mockPerformance.now.mockImplementation(() => {
        callCount++;
        return callCount <= 1 ? 1000 : 2000;
      });

      const result = await service.measureAsyncOperation(
        mockOperation,
        'test-operation',
        { context: 'test' }
      );

      expect(result).toBe('success');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'performance_metric',
          metadata: expect.objectContaining({
            type: 'async_operation',
            operationName: 'test-operation',
            status: 'success',
            context: 'test',
          }),
        })
      );
    });

    it('should measure failed async operation', async () => {
      const mockError = new Error('Operation failed');
      const mockOperation = vi.fn().mockRejectedValue(mockError);
      let callCount = 0;
      mockPerformance.now.mockImplementation(() => {
        callCount++;
        return callCount <= 1 ? 1000 : 1500;
      });

      await expect(
        service.measureAsyncOperation(mockOperation, 'failed-operation')
      ).rejects.toThrow('Operation failed');

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'performance_metric',
          metadata: expect.objectContaining({
            type: 'async_operation',
            operationName: 'failed-operation',
            status: 'error',
            error: 'Operation failed',
          }),
        })
      );
    });
  });

  describe('component render measurement', () => {
    it('should measure component render time', () => {
      let callCount = 0;
      mockPerformance.now.mockImplementation(() => {
        callCount++;
        return callCount <= 1 ? 1000 : 1100;
      });

      const finishMeasurement = service.measureComponentRender('TestComponent');
      finishMeasurement();

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'performance_metric',
          metadata: expect.objectContaining({
            type: 'component_render',
            componentName: 'TestComponent',
            renderTime: 100,
          }),
        })
      );
    });
  });

  describe('user interaction tracking', () => {
    it('should track user interactions', () => {
      service.trackUserInteraction('click', 'button#submit', 250);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'user_interaction',
          metadata: expect.objectContaining({
            interactionType: 'click',
            element: 'button#submit',
            duration: 250,
          }),
        })
      );
    });
  });

  describe('performance budget', () => {
    it('should check performance budget and create alerts for violations', async () => {
      service.setBudget({
        pageLoadTime: 1000,
        firstContentfulPaint: 500,
        largestContentfulPaint: 1000,
      });

      mockPerformance.getEntriesByType.mockImplementation((type: string) => {
        if (type === 'navigation') {
          return [{
            fetchStart: 1000,
            loadEventEnd: 6000,
            domContentLoadedEventEnd: 5000,
          }];
        }
        if (type === 'paint') {
          return [
            { name: 'first-contentful-paint', startTime: 2000 },
          ];
        }
        return [];
      });

      await collectMetricsWithTimers();
      const report = service.getPerformanceReport();

      expect(report.budgetStatus.pageLoadTime.status).toBe('fail');
      expect(report.budgetStatus.firstContentfulPaint.status).toBe('fail');
    });

    it('should pass budget checks for good performance', async () => {
      service.setBudget({
        pageLoadTime: 3000,
        firstContentfulPaint: 1500,
      });

      mockPerformance.getEntriesByType.mockImplementation((type: string) => {
        if (type === 'navigation') {
          return [{
            fetchStart: 1000,
            loadEventEnd: 3000,
            domContentLoadedEventEnd: 2500,
          }];
        }
        if (type === 'paint') {
          return [
            { name: 'first-contentful-paint', startTime: 1200 },
          ];
        }
        return [];
      });

      await collectMetricsWithTimers();
      const report = service.getPerformanceReport();

      expect(report.budgetStatus.pageLoadTime.status).toBe('pass');
      expect(report.budgetStatus.firstContentfulPaint.status).toBe('pass');
    });
  });

  describe('performance monitoring', () => {
    it('should start and stop monitoring', () => {
      expect(() => service.startMonitoring()).not.toThrow();
      expect(() => service.stopMonitoring()).not.toThrow();
    });

    it('should not start monitoring twice', () => {
      service.startMonitoring();
      expect(() => service.startMonitoring()).not.toThrow();
      service.stopMonitoring();
    });
  });

  describe('performance report', () => {
    it('should generate comprehensive performance report', async () => {
      await collectMetricsWithTimers();

      const report = service.getPerformanceReport();

      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('trends');
      expect(report).toHaveProperty('alerts');
      expect(report).toHaveProperty('budgetStatus');

      expect(report.summary).toBeDefined();
      expect(Array.isArray(report.trends)).toBe(true);
      expect(Array.isArray(report.alerts)).toBe(true);
      expect(typeof report.budgetStatus).toBe('object');
    });

    it('should handle empty metrics gracefully', () => {
      const report = service.getPerformanceReport();

      expect(report.summary).toBeDefined();
      expect(report.trends).toEqual([]);
      expect(report.alerts).toEqual([]);
    });
  });

  describe('Web Vitals simulation', () => {
    it('should handle Largest Contentful Paint observations', () => {
      service.startMonitoring();
      expect(() => service.startMonitoring()).not.toThrow();
      service.stopMonitoring();
    });

    it('should handle First Input Delay observations', () => {
      expect(() => service.startMonitoring()).not.toThrow();
      service.stopMonitoring();
    });

    it('should handle Cumulative Layout Shift observations', () => {
      expect(() => service.startMonitoring()).not.toThrow();
      service.stopMonitoring();
    });
  });

  describe('error handling', () => {
    it('should handle missing PerformanceObserver gracefully', () => {
      const originalObserver = (globalThis as Record<string, unknown>).PerformanceObserver;
      delete (globalThis as Record<string, unknown>).PerformanceObserver;
      delete (window as Record<string, unknown>).PerformanceObserver;

      const svc = new PerformanceService();
      expect(() => svc.startMonitoring()).not.toThrow();
      svc.stopMonitoring();

      Object.defineProperty(globalThis, 'PerformanceObserver', {
        value: originalObserver,
        writable: true,
        configurable: true,
      });
    });

    it('should handle missing performance.memory gracefully', async () => {
      const originalMemory = (mockPerformance as Record<string, unknown>).memory;
      delete (mockPerformance as Record<string, unknown>).memory;

      const metrics = await collectMetricsWithTimers();
      expect(metrics.memoryUsage).toBeUndefined();

      (mockPerformance as Record<string, unknown>).memory = originalMemory;
    });

    it('should handle missing navigator.connection gracefully', async () => {
      const originalConnection = (navigator as Record<string, unknown>).connection;
      Object.defineProperty(navigator, 'connection', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      delete (navigator as Record<string, unknown>).connection;

      const metrics = await collectMetricsWithTimers();
      expect(metrics.connectionInfo).toBeUndefined();

      Object.defineProperty(navigator, 'connection', {
        value: originalConnection,
        writable: true,
        configurable: true,
      });
    });
  });
});

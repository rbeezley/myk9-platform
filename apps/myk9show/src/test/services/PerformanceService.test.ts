import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PerformanceService } from '../../services/PerformanceService';
import { auditService } from '../../services/AuditService';

// Mock performance API
const mockPerformance = {
  now: vi.fn(() => Date.now()),
  getEntriesByType: vi.fn(),
  mark: vi.fn(),
  measure: vi.fn(),
  clearMarks: vi.fn(),
  clearMeasures: vi.fn(),
  memory: {
    usedJSHeapSize: 10000000,
    totalJSHeapSize: 20000000,
    jsHeapSizeLimit: 50000000,
  },
};

Object.defineProperty(window, 'performance', { value: mockPerformance });

// Mock PerformanceObserver
class MockPerformanceObserver {
  private callback: (entries: unknown) => void;
  
  constructor(callback: (entries: unknown) => void) {
    this.callback = callback;
  }
  
  observe() {}
  disconnect() {}
  
  // Method to trigger callback for testing
  triggerCallback(entries: unknown) {
    this.callback(entries);
  }
}

Object.defineProperty(window, 'PerformanceObserver', { value: MockPerformanceObserver });

// Mock navigator
Object.defineProperty(navigator, 'connection', {
  value: {
    effectiveType: '4g',
    downlink: 10,
    rtt: 50,
    saveData: false,
  },
  configurable: true,
});

// Mock document
Object.defineProperty(document, 'readyState', {
  value: 'complete',
  writable: true,
});

// Mock audit service
vi.mock('../../services/AuditService', () => ({
  auditService: {
    log: vi.fn(),
  },
}));

describe('PerformanceService', () => {
  let service: PerformanceService;

  beforeEach(() => {
    service = new PerformanceService();
    vi.clearAllMocks();
    
    // Reset performance mock
    mockPerformance.getEntriesByType.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('metrics collection', () => {
    it('should collect basic performance metrics', async () => {
      // Mock navigation timing
      mockPerformance.getEntriesByType.mockImplementation((type) => {
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

      const metrics = await service.collectMetrics();

      expect(metrics.pageLoadTime).toBe(3000); // loadEventEnd - fetchStart
      expect(metrics.firstContentfulPaint).toBe(1500);
      expect(metrics.resourceLoadTimes).toHaveLength(1);
      expect(metrics.resourceLoadTimes[0].name).toBe('https://example.com/script.js');
      expect(metrics.memoryUsage).toBeDefined();
      expect(metrics.connectionInfo).toBeDefined();
    });

    it('should handle missing performance data gracefully', async () => {
      mockPerformance.getEntriesByType.mockReturnValue([]);

      const metrics = await service.collectMetrics();

      expect(metrics.pageLoadTime).toBe(0);
      expect(metrics.firstContentfulPaint).toBe(0);
      expect(metrics.resourceLoadTimes).toHaveLength(0);
    });

    it('should collect memory usage information', async () => {
      const metrics = await service.collectMetrics();

      expect(metrics.memoryUsage).toEqual({
        usedJSHeapSize: 10000000,
        totalJSHeapSize: 20000000,
        jsHeapSizeLimit: 50000000,
      });
    });

    it('should collect connection information', async () => {
      const metrics = await service.collectMetrics();

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
      const startTime = performance.now();
      mockPerformance.now.mockReturnValueOnce(startTime).mockReturnValueOnce(startTime + 2000);

      await service.measurePageLoad('test-page');

      // Should call auditService.log for page load metric
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'performance_metric',
          metadata: expect.objectContaining({
            type: 'page_load',
            pageId: 'test-page',
            loadTime: 2000,
          }),
        })
      );
    });

    it('should handle already loaded document', async () => {
      document.readyState = 'complete';

      await service.measurePageLoad('already-loaded');

      expect(auditService.log).toHaveBeenCalled();
    });
  });

  describe('async operation measurement', () => {
    it('should measure successful async operation', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success');
      const startTime = performance.now();
      mockPerformance.now.mockReturnValueOnce(startTime).mockReturnValueOnce(startTime + 1000);

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
            duration: 1000,
            status: 'success',
            context: 'test',
          }),
        })
      );
    });

    it('should measure failed async operation', async () => {
      const mockError = new Error('Operation failed');
      const mockOperation = vi.fn().mockRejectedValue(mockError);
      const startTime = performance.now();
      mockPerformance.now.mockReturnValueOnce(startTime).mockReturnValueOnce(startTime + 500);

      await expect(
        service.measureAsyncOperation(mockOperation, 'failed-operation')
      ).rejects.toThrow('Operation failed');

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'performance_metric',
          metadata: expect.objectContaining({
            type: 'async_operation',
            operationName: 'failed-operation',
            duration: 500,
            status: 'error',
            error: 'Operation failed',
          }),
        })
      );
    });
  });

  describe('component render measurement', () => {
    it('should measure component render time', () => {
      const startTime = performance.now();
      mockPerformance.now.mockReturnValueOnce(startTime).mockReturnValueOnce(startTime + 100);

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
      // Set strict budget
      service.setBudget({
        pageLoadTime: 1000,
        firstContentfulPaint: 500,
        largestContentfulPaint: 1000,
      });

      // Mock poor performance
      mockPerformance.getEntriesByType.mockImplementation((type) => {
        if (type === 'navigation') {
          return [{
            fetchStart: 1000,
            loadEventEnd: 6000, // 5 seconds - exceeds budget
            domContentLoadedEventEnd: 5000,
          }];
        }
        if (type === 'paint') {
          return [
            { name: 'first-contentful-paint', startTime: 2000 }, // Exceeds budget
          ];
        }
        return [];
      });

      const report = service.getPerformanceReport();

      // Should detect budget violations
      expect(report.budgetStatus.pageLoadTime.status).toBe('fail');
      expect(report.budgetStatus.firstContentfulPaint.status).toBe('fail');
    });

    it('should pass budget checks for good performance', async () => {
      // Set reasonable budget
      service.setBudget({
        pageLoadTime: 3000,
        firstContentfulPaint: 1500,
      });

      // Mock good performance
      mockPerformance.getEntriesByType.mockImplementation((type) => {
        if (type === 'navigation') {
          return [{
            fetchStart: 1000,
            loadEventEnd: 3000, // 2 seconds - within budget
            domContentLoadedEventEnd: 2500,
          }];
        }
        if (type === 'paint') {
          return [
            { name: 'first-contentful-paint', startTime: 1200 }, // Within budget
          ];
        }
        return [];
      });

      await service.collectMetrics();
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
      // Collect some metrics first
      await service.collectMetrics();

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
    it('should handle Largest Contentful Paint observations', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Simulate LCP observer
      service.startMonitoring();

      // We can't easily test the actual PerformanceObserver callbacks,
      // but we can test that monitoring starts without errors
      expect(() => service.startMonitoring()).not.toThrow();

      service.stopMonitoring();
      consoleSpy.mockRestore();
    });

    it('should handle First Input Delay observations', async () => {
      // Similar to LCP test - ensure FID monitoring doesn't crash
      expect(() => service.startMonitoring()).not.toThrow();
      service.stopMonitoring();
    });

    it('should handle Cumulative Layout Shift observations', async () => {
      // Similar to other Web Vitals tests
      expect(() => service.startMonitoring()).not.toThrow();
      service.stopMonitoring();
    });
  });

  describe('error handling', () => {
    it('should handle missing PerformanceObserver gracefully', async () => {
      // Remove PerformanceObserver temporarily
      const originalObserver = window.PerformanceObserver;
      delete (window as Record<string, unknown>).PerformanceObserver;

      const service = new PerformanceService();
      expect(() => service.startMonitoring()).not.toThrow();

      // Restore PerformanceObserver
      Object.defineProperty(window, 'PerformanceObserver', { value: originalObserver });
    });

    it('should handle missing performance.memory gracefully', async () => {
      const originalMemory = mockPerformance.memory;
      delete mockPerformance.memory;

      const metrics = await service.collectMetrics();
      expect(metrics.memoryUsage).toBeUndefined();

      mockPerformance.memory = originalMemory;
    });

    it('should handle missing navigator.connection gracefully', async () => {
      const originalConnection = (navigator as Record<string, unknown>).connection;
      delete (navigator as Record<string, unknown>).connection;

      const metrics = await service.collectMetrics();
      expect(metrics.connectionInfo).toBeUndefined();

      Object.defineProperty(navigator, 'connection', { value: originalConnection });
    });
  });
});
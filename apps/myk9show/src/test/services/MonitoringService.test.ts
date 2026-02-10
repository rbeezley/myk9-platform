import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the logger
vi.mock('@/services/LoggingService', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    setUserId: vi.fn(),
    logUserAction: vi.fn(),
    logFeatureUsage: vi.fn(),
    logApiCall: vi.fn()
  }
}));

// Mock window APIs
const mockPerformanceObserver = vi.fn();
const mockMutationObserverObserve = vi.fn();
const mockMutationObserverDisconnect = vi.fn();
const mockMutationObserver = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
  this.observe = mockMutationObserverObserve;
  this.disconnect = mockMutationObserverDisconnect;
  this.takeRecords = vi.fn().mockReturnValue([]);
});
const mockAddEventListener = vi.fn();
const mockFetch = vi.fn().mockResolvedValue({ ok: true });

// Mock performance API
const mockPerformance = {
  now: vi.fn(() => Date.now()),
  getEntries: vi.fn(() => []),
  mark: vi.fn(),
  measure: vi.fn()
};

// Mock external services
const mockGtag = vi.fn();
const mockMixpanel = { track: vi.fn() };
const mockDDRUM = {
  addUserAction: vi.fn(),
  addError: vi.fn()
};
const mockSentry = {
  captureException: vi.fn()
};

// Ensure document.body exists before MonitoringService tries to observe it
if (!document.body) {
  document.body = document.createElement('body');
}

// Set mocks on the real jsdom window object so that checks like
// `'PerformanceObserver' in window` and `window.gtag` work correctly.
Object.assign(window, {
  addEventListener: mockAddEventListener,
  location: { href: 'https://example.com' },
  gtag: mockGtag,
  mixpanel: mockMixpanel,
  DD_RUM: mockDDRUM,
  Sentry: mockSentry,
  PerformanceObserver: mockPerformanceObserver,
  MutationObserver: mockMutationObserver
});

// Stub global fetch so that the source code's bare `fetch()` calls use our mock
vi.stubGlobal('fetch', mockFetch);
vi.stubGlobal('performance', mockPerformance);
vi.stubGlobal('MutationObserver', mockMutationObserver);

// Mock import.meta
vi.mock('import.meta', () => ({
  env: {
    VITE_DATADOG_CLIENT_TOKEN: 'test-token',
    VITE_ANALYTICS_ENDPOINT: 'https://analytics.example.com'
  }
}));

// Import MonitoringService AFTER all mocks are set up
import { MonitoringService } from '@/services/MonitoringService';

describe('MonitoringService', () => {
  let monitoring: MonitoringService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Restore mock implementations after clearAllMocks resets them
    mockMutationObserver.mockImplementation(function (this: Record<string, unknown>) {
      this.observe = mockMutationObserverObserve;
      this.disconnect = mockMutationObserverDisconnect;
      this.takeRecords = vi.fn().mockReturnValue([]);
    });
    mockPerformanceObserver.mockImplementation(function (this: Record<string, unknown>, _callback: unknown) {
      this.observe = vi.fn();
      this.disconnect = vi.fn();
    });
    mockFetch.mockResolvedValue({ ok: true });

    // Restore external service mocks on window
    (window as unknown as Record<string, unknown>).gtag = mockGtag;
    (window as unknown as Record<string, unknown>).mixpanel = mockMixpanel;
    (window as unknown as Record<string, unknown>).DD_RUM = mockDDRUM;
    (window as unknown as Record<string, unknown>).Sentry = mockSentry;

    // Ensure import.meta.env has the analytics endpoint
    import.meta.env.VITE_ANALYTICS_ENDPOINT = 'https://analytics.example.com';
    import.meta.env.VITE_DATADOG_CLIENT_TOKEN = 'test-token';

    // Reset singleton
    (MonitoringService as unknown as { instance: MonitoringService }).instance = undefined as unknown as MonitoringService;
    monitoring = MonitoringService.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const monitoring1 = MonitoringService.getInstance();
      const monitoring2 = MonitoringService.getInstance();
      
      expect(monitoring1).toBe(monitoring2);
    });
  });

  describe('Performance Monitoring', () => {
    it('should record performance metrics', () => {
      const name = 'api.response_time';
      const value = 150;
      const unit = 'ms';
      const metadata = { endpoint: '/api/dogs' };
      
      monitoring.recordPerformanceMetric(name, value, unit, metadata);
      
      const metrics = monitoring.getPerformanceMetrics(name);
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toMatchObject({
        name,
        value,
        unit,
        metadata
      });
      expect(metrics[0].timestamp).toBeTypeOf('number');
    });

    it('should get all performance metrics when no name specified', () => {
      monitoring.recordPerformanceMetric('metric1', 100, 'ms');
      monitoring.recordPerformanceMetric('metric2', 200, 'ms');
      
      const allMetrics = monitoring.getPerformanceMetrics();
      expect(allMetrics).toHaveLength(2);
    });

    it('should measure resource timing with promises', async () => {
      const mockResource = vi.fn().mockResolvedValue('result');
      
      const result = await monitoring.measureResourceTiming('test-resource', mockResource);
      
      expect(result).toBe('result');
      expect(mockResource).toHaveBeenCalled();
      
      const metrics = monitoring.getPerformanceMetrics('resource.test-resource');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].unit).toBe('ms');
    });

    it('should handle resource timing errors', async () => {
      const mockResource = vi.fn().mockRejectedValue(new Error('Resource failed'));
      
      await expect(
        monitoring.measureResourceTiming('failed-resource', mockResource)
      ).rejects.toThrow('Resource failed');
      
      const metrics = monitoring.getPerformanceMetrics('resource.failed-resource');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].metadata?.error).toBe(true);
      
      const errors = monitoring.getErrors();
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should measure component render time', () => {
      const mockComponent = vi.fn().mockReturnValue('rendered');
      
      const result = monitoring.measureComponentRender('TestComponent', mockComponent);
      
      expect(result).toBe('rendered');
      expect(mockComponent).toHaveBeenCalled();
      
      const metrics = monitoring.getPerformanceMetrics('component.render.TestComponent');
      expect(metrics).toHaveLength(1);
    });

    it('should handle component render errors', () => {
      const mockComponent = vi.fn().mockImplementation(() => {
        throw new Error('Render failed');
      });
      
      expect(() => 
        monitoring.measureComponentRender('FailedComponent', mockComponent)
      ).toThrow('Render failed');
      
      const metrics = monitoring.getPerformanceMetrics('component.render.FailedComponent');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].metadata?.error).toBe(true);
    });
  });

  describe('Error Monitoring', () => {
    it('should record errors', () => {
      const message = 'Test error';
      const component = 'TestComponent';
      const metadata = { userId: 'user123' };
      const error = new Error('Original error');
      
      monitoring.recordError(message, component, metadata, error);
      
      const errors = monitoring.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        message,
        component,
        metadata,
        stack: error.stack
      });
      expect(errors[0].fingerprint).toContain(component);
    });

    it('should group errors by fingerprint', () => {
      monitoring.recordError('Error 1', 'component1');
      monitoring.recordError('Error 2', 'component1');
      monitoring.recordError('Error 1', 'component2');
      
      const groupedErrors = monitoring.getErrorsByFingerprint();
      expect(groupedErrors.size).toBeGreaterThan(0);
      
      // Should have different fingerprints for different components
      const fingerprints = Array.from(groupedErrors.keys());
      expect(fingerprints.some(fp => fp.includes('component1'))).toBe(true);
      expect(fingerprints.some(fp => fp.includes('component2'))).toBe(true);
    });
  });

  describe('User Analytics', () => {
    it('should set user ID', () => {
      const userId = 'user123';
      
      monitoring.setUserId(userId);
      
      // User ID should be set in the service
      // We can verify this by tracking an event and checking if it includes the user ID
      monitoring.trackUserEvent('test_event');
      
      const events = monitoring.getUserEvents();
      expect(events.some(e => e.userId === userId)).toBe(true);
    });

    it('should track user events', () => {
      const event = 'button_click';
      const properties = { buttonId: 'submit', page: 'home' };

      const eventsBefore = monitoring.getUserEvents().length;
      monitoring.trackUserEvent(event, properties);

      const events = monitoring.getUserEvents();
      expect(events).toHaveLength(eventsBefore + 1);

      const trackedEvent = events.find(e => e.event === event);
      expect(trackedEvent).toBeDefined();
      expect(trackedEvent).toMatchObject({
        event,
        properties: expect.objectContaining(properties)
      });
      expect(trackedEvent!.sessionId).toBeDefined();
      expect(trackedEvent!.timestamp).toBeTypeOf('number');
    });

    it('should track feature usage', () => {
      const feature = 'offline-scoring';
      const metadata = { scoreCount: 5 };
      
      monitoring.trackFeatureUsage(feature, metadata);
      
      const events = monitoring.getUserEvents();
      const featureEvent = events.find(e => e.event === 'feature_used');
      expect(featureEvent).toBeDefined();
      expect(featureEvent?.properties).toMatchObject({
        feature,
        ...metadata
      });
    });

    it('should track API calls', () => {
      const method = 'POST';
      const url = '/api/dogs';
      const status = 201;
      const duration = 150;
      const metadata = { dogId: 'dog123' };
      
      monitoring.trackApiCall(method, url, status, duration, metadata);
      
      // Should record performance metric
      const perfMetrics = monitoring.getPerformanceMetrics('api.response_time');
      expect(perfMetrics).toHaveLength(1);
      expect(perfMetrics[0].value).toBe(duration);
      
      // Should track user event
      const events = monitoring.getUserEvents();
      const apiEvent = events.find(e => e.event === 'api_call');
      expect(apiEvent).toBeDefined();
      expect(apiEvent?.properties).toMatchObject({
        method,
        url,
        status,
        duration,
        ...metadata
      });
    });

    it('should get session events', () => {
      monitoring.trackUserEvent('event1');
      monitoring.trackUserEvent('event2');
      
      const sessionEvents = monitoring.getSessionEvents();
      const allEvents = monitoring.getUserEvents();
      
      expect(sessionEvents.length).toBe(allEvents.length);
      sessionEvents.forEach(event => {
        expect(event.sessionId).toBeDefined();
      });
    });
  });

  describe('Health Status', () => {
    it('should calculate health status', () => {
      // Add some performance metrics
      monitoring.recordPerformanceMetric('test.metric1', 100, 'ms');
      monitoring.recordPerformanceMetric('test.metric2', 200, 'ms');
      monitoring.recordPerformanceMetric('test.metric3', 300, 'ms');
      
      // Add some errors
      monitoring.recordError('Error 1', 'component1');
      monitoring.recordError('Error 2', 'component2');
      
      // Add user events
      monitoring.setUserId('user1');
      monitoring.trackUserEvent('event1');
      monitoring.setUserId('user2');
      monitoring.trackUserEvent('event2');
      
      const health = monitoring.getHealthStatus();
      
      expect(health.performance.avg).toBeGreaterThan(0);
      expect(health.performance.p95).toBeGreaterThan(0);
      expect(health.errors.total).toBe(2);
      expect(health.errors.recent).toBeGreaterThanOrEqual(0);
      expect(health.users.active).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty metrics gracefully', () => {
      const health = monitoring.getHealthStatus();
      
      expect(health.performance.avg).toBe(0);
      expect(health.performance.p95).toBe(0);
      expect(health.errors.total).toBe(0);
      expect(health.errors.recent).toBe(0);
      expect(health.users.active).toBe(0);
    });
  });

  describe('External Integrations', () => {
    it('should send metrics to Google Analytics', () => {
      monitoring.recordPerformanceMetric('test.metric', 150, 'ms');
      
      expect(mockGtag).toHaveBeenCalledWith(
        'event',
        'performance_metric',
        expect.objectContaining({
          metric_name: 'test.metric',
          metric_value: 150,
          metric_unit: 'ms'
        })
      );
    });

    it('should send events to external analytics', () => {
      monitoring.trackUserEvent('test_event', { property: 'value' });
      
      expect(mockGtag).toHaveBeenCalledWith(
        'event',
        'test_event',
        expect.objectContaining({
          property: 'value'
        })
      );
      
      expect(mockMixpanel.track).toHaveBeenCalledWith(
        'test_event',
        expect.objectContaining({
          property: 'value'
        })
      );
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://analytics.example.com',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('test_event')
        })
      );
    });

    it('should send errors to Sentry', () => {
      monitoring.recordError('Test error', 'component', { extra: 'data' });
      
      expect(mockSentry.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: { component: 'component' },
          extra: { extra: 'data' }
        })
      );
    });

    it('should send errors to DataDog', () => {
      monitoring.recordError('Test error', 'component', { extra: 'data' });
      
      expect(mockDDRUM.addError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          component: 'component',
          extra: 'data'
        })
      );
    });

    it('should handle analytics fetch failures gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      
      monitoring.trackUserEvent('test_event');
      
      // Should not throw, and should log warning
      await new Promise(resolve => setTimeout(resolve, 0));
      
      const { logger } = await import('@/services/LoggingService');
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to send analytics event',
        'analytics',
        expect.objectContaining({ error: 'Error: Network error' })
      );
    });
  });

  describe('Performance Observer Setup', () => {
    it('should setup performance observers if available', () => {
      // Create new instance to trigger observer setup
      (MonitoringService as unknown as { instance: MonitoringService }).instance = undefined as unknown as MonitoringService;
      
      // Mock PerformanceObserver constructor
      mockPerformanceObserver.mockImplementation(function(callback) {
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        // Store callback for testing
        this.callback = callback;
      });
      
      MonitoringService.getInstance();
      
      expect(mockPerformanceObserver).toHaveBeenCalled();
    });

    it('should handle performance observer errors gracefully', () => {
      mockPerformanceObserver.mockImplementation(() => {
        throw new Error('Observer not supported');
      });
      
      // Should not throw when creating instance
      expect(() => {
        (MonitoringService as unknown as { instance: MonitoringService }).instance = undefined as unknown as MonitoringService;
        MonitoringService.getInstance();
      }).not.toThrow();
    });
  });

  describe('Error Handler Setup', () => {
    it('should setup global error handlers', () => {
      // Create new instance to trigger handler setup
      (MonitoringService as unknown as { instance: MonitoringService }).instance = undefined as unknown as MonitoringService;
      MonitoringService.getInstance();
      
      expect(mockAddEventListener).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockAddEventListener).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
    });
  });

  describe('Cleanup', () => {
    it('should destroy monitoring service', () => {
      const disconnectSpy = vi.fn();
      
      // Mock performance monitor with observers
      const mockObserver = { disconnect: disconnectSpy };
      (monitoring as unknown as { performanceMonitor: { observers: unknown[] } }).performanceMonitor.observers = [mockObserver];
      
      monitoring.destroy();
      
      expect(disconnectSpy).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing external services gracefully', () => {
      // Remove external services
      delete (window as unknown as { gtag?: unknown }).gtag;
      delete (window as unknown as { mixpanel?: unknown }).mixpanel;
      delete (window as unknown as { DD_RUM?: unknown }).DD_RUM;
      delete (window as unknown as { Sentry?: unknown }).Sentry;
      
      // Should not throw
      expect(() => {
        monitoring.trackUserEvent('test_event');
        monitoring.recordError('test error');
        monitoring.recordPerformanceMetric('test.metric', 100, 'ms');
      }).not.toThrow();
    });

    it('should generate consistent error fingerprints', () => {
      const message1 = 'Error with ID 123';
      const message2 = 'Error with ID 456';
      
      monitoring.recordError(message1, 'component');
      monitoring.recordError(message2, 'component');
      
      const errors = monitoring.getErrors();
      expect(errors[0].fingerprint).toBe(errors[1].fingerprint);
    });

    it('should handle performance timing edge cases', async () => {
      // Mock performance.now to return same value (zero duration)
      mockPerformance.now.mockReturnValue(1000);
      
      const result = await monitoring.measureResourceTiming('zero-duration', () => Promise.resolve('result'));
      
      expect(result).toBe('result');
      
      const metrics = monitoring.getPerformanceMetrics('resource.zero-duration');
      expect(metrics[0].value).toBe(0);
    });
  });
});
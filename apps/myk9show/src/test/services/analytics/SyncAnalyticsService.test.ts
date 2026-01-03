import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { SyncAnalyticsService, getSyncAnalytics, ANALYTICS_PRESETS } from '../../../services/analytics';

// Mock IndexedDB
const mockIDB = {
  open: vi.fn(),
  databases: vi.fn(() => Promise.resolve([])),
};

const mockDB = {
  createObjectStore: vi.fn(() => ({
    createIndex: vi.fn()
  })),
  transaction: vi.fn(() => ({
    objectStore: vi.fn(() => ({
      put: vi.fn(),
      index: vi.fn(() => ({
        openCursor: vi.fn()
      }))
    }))
  })),
  close: vi.fn(),
  objectStoreNames: {
    contains: vi.fn(() => false)
  }
};

const mockRequest = {
  result: mockDB,
  onsuccess: null as ((this: IDBRequest, ev: Event) => void) | null,
  onerror: null as ((this: IDBRequest, ev: Event) => void) | null,
  onupgradeneeded: null as ((this: IDBOpenDBRequest, ev: IDBVersionChangeEvent) => void) | null
};

beforeAll(() => {
  // Mock IndexedDB
  global.indexedDB = mockIDB as unknown as IDBFactory;
  mockIDB.open.mockReturnValue(mockRequest as unknown as IDBOpenDBRequest);
  
  // Mock navigator.onLine
  Object.defineProperty(global.navigator, 'onLine', {
    writable: true,
    value: true
  });
  
  // Mock window events
  global.window = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  } as unknown as Window & typeof globalThis;
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe('SyncAnalyticsService', () => {
  let analytics: SyncAnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    analytics = getSyncAnalytics(ANALYTICS_PRESETS.testing);
    
    // Trigger database connection success
    if (mockRequest.onsuccess) {
      mockRequest.onsuccess({ target: mockRequest });
    }
  });

  afterEach(() => {
    analytics.destroy();
  });

  describe('Initialization', () => {
    it('should create singleton instance', () => {
      const analytics1 = getSyncAnalytics();
      const analytics2 = getSyncAnalytics();
      expect(analytics1).toBe(analytics2);
    });

    it('should initialize with default metrics', () => {
      const metrics = analytics.getMetrics();
      expect(metrics).toEqual({
        syncSuccessRate: 1.0,
        averageSyncTime: 0,
        conflictRate: 0,
        offlineUsageTime: 0,
        totalSyncs: 0,
        successfulSyncs: 0,
        failedSyncs: 0,
        totalConflicts: 0,
        resolvedConflicts: 0,
        unresolvedConflicts: 0,
        bandwidthUsed: 0,
        dataCompressed: 0,
        compressionRatio: 1.0,
        lastSyncTime: null,
        lastSuccessfulSync: null,
        lastFailedSync: null
      });
    });

    it('should initialize with provided config', () => {
      const customConfig = {
        samplingRate: 0.5,
        retentionDays: 14,
        enableRealTimeAlerts: false
      };
      
      const customAnalytics = getSyncAnalytics(customConfig);
      expect(customAnalytics).toBeDefined();
    });
  });

  describe('Sync Operation Tracking', () => {
    it('should track sync operation lifecycle', async () => {
      const syncId = 'test-sync-1';
      const entity = 'dogs';
      
      // Start sync
      await analytics.trackSyncStart(syncId, 'upload', entity);
      
      // Progress update
      await analytics.trackSyncProgress(syncId, {
        recordsProcessed: 10,
        bytesTransferred: 1024,
        conflicts: 1
      });
      
      // Complete sync
      await analytics.trackSyncComplete(syncId, {
        success: true,
        recordsProcessed: 10,
        bytesTransferred: 1024,
        conflicts: 1,
        conflictsResolved: 1
      });
      
      const metrics = analytics.getMetrics();
      expect(metrics.totalSyncs).toBe(1);
      expect(metrics.successfulSyncs).toBe(1);
      expect(metrics.syncSuccessRate).toBe(1.0);
      expect(metrics.bandwidthUsed).toBe(1024);
    });

    it('should track failed sync operations', async () => {
      const syncId = 'test-sync-fail';
      
      await analytics.trackSyncStart(syncId, 'download', 'shows');
      await analytics.trackSyncComplete(syncId, {
        success: false,
        error: 'Network timeout'
      });
      
      const metrics = analytics.getMetrics();
      expect(metrics.totalSyncs).toBe(1);
      expect(metrics.failedSyncs).toBe(1);
      expect(metrics.syncSuccessRate).toBe(0);
    });

    it('should calculate average sync time correctly', async () => {
      const syncs = [
        { id: 'sync1', duration: 1000 },
        { id: 'sync2', duration: 2000 },
        { id: 'sync3', duration: 3000 }
      ];
      
      for (const sync of syncs) {
        await analytics.trackSyncStart(sync.id, 'bidirectional', 'people');
        // Simulate duration by waiting
        await new Promise(resolve => setTimeout(resolve, 10));
        await analytics.trackSyncComplete(sync.id, { success: true });
      }
      
      const metrics = analytics.getMetrics();
      expect(metrics.totalSyncs).toBe(3);
      expect(metrics.averageSyncTime).toBeGreaterThan(0);
    });

    it('should track bandwidth and compression', async () => {
      await analytics.trackSyncStart('sync-compress', 'upload', 'clubs');
      await analytics.trackSyncComplete('sync-compress', {
        success: true,
        bytesTransferred: 2048,
        bytesCompressed: 1024
      });
      
      const metrics = analytics.getMetrics();
      expect(metrics.bandwidthUsed).toBe(2048);
      expect(metrics.dataCompressed).toBe(1024);
      expect(metrics.compressionRatio).toBe(0.5);
    });
  });

  describe('Conflict Tracking', () => {
    it('should track conflict resolution', async () => {
      await analytics.trackConflict('dogs', 'field-conflict', true, 'last-write-wins');
      await analytics.trackConflict('shows', 'merge-conflict', false);
      
      const metrics = analytics.getMetrics();
      expect(metrics.totalConflicts).toBe(2);
      expect(metrics.resolvedConflicts).toBe(1);
      expect(metrics.unresolvedConflicts).toBe(1);
      expect(metrics.conflictRate).toBe(0); // No syncs yet, so rate is 0
    });

    it('should calculate conflict rate based on syncs', async () => {
      // Perform some syncs first
      await analytics.trackSyncStart('sync1', 'upload', 'dogs');
      await analytics.trackSyncComplete('sync1', { success: true });
      
      await analytics.trackSyncStart('sync2', 'upload', 'shows');
      await analytics.trackSyncComplete('sync2', { success: true });
      
      // Add conflicts
      await analytics.trackConflict('dogs', 'field-conflict', true);
      
      const metrics = analytics.getMetrics();
      expect(metrics.conflictRate).toBe(0.5); // 1 conflict / 2 syncs
    });
  });

  describe('Offline Time Tracking', () => {
    it('should track offline usage time', () => {
      const offlineTime = 60000; // 1 minute
      analytics.trackOfflineTime(offlineTime);
      
      const metrics = analytics.getMetrics();
      expect(metrics.offlineUsageTime).toBe(offlineTime);
    });

    it('should accumulate offline time', () => {
      analytics.trackOfflineTime(30000);
      analytics.trackOfflineTime(45000);
      
      const metrics = analytics.getMetrics();
      expect(metrics.offlineUsageTime).toBe(75000);
    });
  });

  describe('Health Score Calculation', () => {
    it('should calculate health score for perfect metrics', () => {
      // Set up perfect metrics by completing successful syncs
      Promise.all([
        analytics.trackSyncStart('perfect1', 'upload', 'dogs'),
        analytics.trackSyncStart('perfect2', 'upload', 'shows')
      ]).then(() => {
        return Promise.all([
          analytics.trackSyncComplete('perfect1', { success: true }),
          analytics.trackSyncComplete('perfect2', { success: true })
        ]);
      });
      
      const health = analytics.getSyncHealth();
      expect(health.score).toBeGreaterThan(80);
      expect(health.status).toMatch(/excellent|good/);
    });

    it('should provide recommendations for poor health', async () => {
      // Create poor metrics
      await analytics.trackSyncStart('poor1', 'upload', 'dogs');
      await analytics.trackSyncComplete('poor1', { success: false });
      
      await analytics.trackSyncStart('poor2', 'upload', 'shows');
      await analytics.trackSyncComplete('poor2', { success: false });
      
      const health = analytics.getSyncHealth();
      expect(health.score).toBeLessThan(50);
      expect(health.recommendations).toContain('Investigate sync failures - success rate below 80%');
    });
  });

  describe('Performance Benchmarks', () => {
    it('should create and update benchmarks', async () => {
      const entity = 'dogs';
      const operation = 'upload';
      
      await analytics.trackSyncStart('bench1', operation, entity);
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      await analytics.trackSyncComplete('bench1', { success: true });
      
      const benchmarks = analytics.getBenchmarks(entity);
      expect(benchmarks).toHaveLength(1);
      expect(benchmarks[0].entity).toBe(entity);
      expect(benchmarks[0].operation).toBe(operation);
      expect(benchmarks[0].sampleSize).toBe(1);
    });

    it('should filter benchmarks by entity', async () => {
      await analytics.trackSyncStart('dog1', 'upload', 'dogs');
      await analytics.trackSyncComplete('dog1', { success: true });
      
      await analytics.trackSyncStart('show1', 'download', 'shows');
      await analytics.trackSyncComplete('show1', { success: true });
      
      const dogBenchmarks = analytics.getBenchmarks('dogs');
      const showBenchmarks = analytics.getBenchmarks('shows');
      const allBenchmarks = analytics.getBenchmarks();
      
      expect(dogBenchmarks).toHaveLength(1);
      expect(showBenchmarks).toHaveLength(1);
      expect(allBenchmarks).toHaveLength(2);
    });
  });

  describe('Event Emission', () => {
    it('should emit sync events', async () => {
      const syncStartedSpy = vi.fn();
      const syncCompletedSpy = vi.fn();
      
      analytics.on('sync:started', syncStartedSpy);
      analytics.on('sync:completed', syncCompletedSpy);
      
      await analytics.trackSyncStart('event-test', 'upload', 'dogs');
      await analytics.trackSyncComplete('event-test', { success: true });
      
      expect(syncStartedSpy).toHaveBeenCalledTimes(1);
      expect(syncCompletedSpy).toHaveBeenCalledTimes(1);
    });

    it('should emit conflict events', async () => {
      const conflictSpy = vi.fn();
      analytics.on('conflict:tracked', conflictSpy);
      
      await analytics.trackConflict('dogs', 'field-conflict', true);
      
      expect(conflictSpy).toHaveBeenCalledTimes(1);
      expect(conflictSpy).toHaveBeenCalledWith(expect.objectContaining({
        entityType: 'dogs',
        conflictType: 'field-conflict',
        resolved: true
      }));
    });

    it('should emit offline tracking events', () => {
      const offlineSpy = vi.fn();
      analytics.on('offline:tracked', offlineSpy);
      
      analytics.trackOfflineTime(30000);
      
      expect(offlineSpy).toHaveBeenCalledWith({ duration: 30000 });
    });
  });

  describe('Alert System', () => {
    beforeEach(() => {
      // Enable alerts for testing
      const testAnalytics = getSyncAnalytics({
        ...ANALYTICS_PRESETS.testing,
        enableRealTimeAlerts: true,
        alertThresholds: {
          failureRate: 0.3,
          avgSyncTime: 1000,
          conflictRate: 0.2,
          bandwidthUsage: 500
        }
      });
      analytics = testAnalytics;
    });

    it('should trigger alerts for high failure rate', async () => {
      const alertSpy = vi.fn();
      analytics.on('alerts:triggered', alertSpy);
      
      // Create failing syncs
      for (let i = 0; i < 5; i++) {
        await analytics.trackSyncStart(`fail-${i}`, 'upload', 'dogs');
        await analytics.trackSyncComplete(`fail-${i}`, { success: false });
      }
      
      // The alert should have been triggered
      expect(alertSpy).toHaveBeenCalled();
    });

    it('should trigger alerts for slow syncs', async () => {
      const alertSpy = vi.fn();
      analytics.on('alerts:triggered', alertSpy);
      
      await analytics.trackSyncStart('slow-sync', 'upload', 'dogs');
      
      // Simulate a slow sync by waiting then completing with long duration
      await new Promise(resolve => setTimeout(resolve, 10));
      await analytics.trackSyncComplete('slow-sync', { 
        success: true,
        duration: 5000 // 5 seconds, above threshold
      });
      
      expect(alertSpy).toHaveBeenCalled();
    });

    it('should detect anomalies', async () => {
      const anomalySpy = vi.fn();
      analytics.on('anomaly:detected', anomalySpy);
      
      // Create normal benchmarks first
      for (let i = 0; i < 3; i++) {
        await analytics.trackSyncStart(`normal-${i}`, 'upload', 'dogs');
        await new Promise(resolve => setTimeout(resolve, 10));
        await analytics.trackSyncComplete(`normal-${i}`, { success: true });
      }
      
      // Create anomalous sync
      await analytics.trackSyncStart('anomaly', 'upload', 'dogs');
      
      // Simulate anomalous sync completion
      await new Promise(resolve => setTimeout(resolve, 10));
      await analytics.trackSyncComplete('anomaly', {
        success: true,
        duration: 50000, // Very slow
        bytesTransferred: 10000000 // Very large
      });
      
      expect(anomalySpy).toHaveBeenCalled();
    });
  });

  describe('Data Export', () => {
    it('should export data as JSON', async () => {
      await analytics.trackSyncStart('export-test', 'upload', 'dogs');
      await analytics.trackSyncComplete('export-test', { success: true });
      
      const exportData = await analytics.exportAnalytics('json');
      expect(typeof exportData).toBe('string');
      
      const parsed = JSON.parse(exportData as string);
      expect(parsed).toHaveProperty('summary');
      expect(parsed).toHaveProperty('health');
      expect(parsed).toHaveProperty('exportDate');
    });

    it('should export data as CSV', async () => {
      await analytics.trackSyncStart('csv-test', 'upload', 'dogs');
      await analytics.trackSyncComplete('csv-test', { success: true });
      
      const exportData = await analytics.exportAnalytics('csv');
      expect(exportData).toBeInstanceOf(Blob);
      
      const blob = exportData as Blob;
      expect(blob.type).toBe('text/csv');
    });

    it('should export data for date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      
      const exportData = await analytics.exportAnalytics('json', startDate, endDate);
      expect(typeof exportData).toBe('string');
    });
  });

  describe('Trend Analysis', () => {
    it('should get trends by period', async () => {
      const trends = await analytics.getTrends('hour');
      expect(Array.isArray(trends)).toBe(true);
    });

    it('should filter trends by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      
      const trends = await analytics.getTrends('day', startDate, endDate);
      expect(Array.isArray(trends)).toBe(true);
    });
  });

  describe('Memory Management', () => {
    it('should cleanup old operations', async () => {
      // Create many operations to trigger cleanup
      for (let i = 0; i < 1100; i++) {
        await analytics.trackSyncStart(`cleanup-${i}`, 'upload', 'dogs');
        await analytics.trackSyncComplete(`cleanup-${i}`, { success: true });
      }
      
      // Check if cleanup occurred (events should be limited)
      const metrics = await analytics.getSyncMetrics();
      expect(metrics.totalEvents).toBeLessThanOrEqual(1000);
    });

    it('should destroy properly', async () => {
      const destroySpy = vi.spyOn(analytics, 'destroy');
      analytics.destroy();
      
      expect(destroySpy).toHaveBeenCalled();
      
      // Verify cleanup by checking metrics
      const metrics = await analytics.getSyncMetrics();
      expect(metrics.totalEvents).toBe(0);
    });
  });

  describe('Sampling', () => {
    it('should respect sampling rate', async () => {
      const samplingAnalytics = getSyncAnalytics({
        samplingRate: 0.0 // No sampling
      });
      
      await samplingAnalytics.trackSyncStart('sample-test', 'upload', 'dogs');
      
      // With 0% sampling, no operations should be tracked
      const metrics = await samplingAnalytics.getSyncMetrics();
      expect(metrics.totalEvents).toBe(0);
      
      samplingAnalytics.destroy();
    });
  });
});

describe('Analytics Integration', () => {
  it('should integrate with external services', () => {
    const analytics = getSyncAnalytics();
    
    // Test that the service can be integrated
    expect(analytics).toHaveProperty('trackSyncStart');
    expect(analytics).toHaveProperty('trackSyncComplete');
    expect(analytics).toHaveProperty('trackConflict');
    expect(analytics).toHaveProperty('getMetrics');
    expect(analytics).toHaveProperty('getSyncHealth');
    
    analytics.destroy();
  });
});
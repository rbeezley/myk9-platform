import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncAnalyticsService, getSyncAnalytics, ANALYTICS_PRESETS } from '../../../services/analytics';
import { logger } from '@myk9/core';

// Mock @myk9/replication to prevent real conflict manager from being used
vi.mock('@myk9/replication', () => ({
  conflictManager: {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getResolutionHistory: vi.fn().mockReturnValue([]),
  },
}));

// Mock @myk9/core logger
vi.mock('@myk9/core', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

/**
 * Helper to reset the singleton between tests.
 * The service uses a private static `instance` field, so we reach in via
 * the constructor's own property to null it out before each test.
 */
function resetSingleton(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (SyncAnalyticsService as any).instance = undefined;
}

describe('SyncAnalyticsService', () => {
  let analytics: SyncAnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    resetSingleton();
    analytics = getSyncAnalytics();
  });

  describe('Initialization', () => {
    it('should create singleton instance', () => {
      const analytics1 = getSyncAnalytics();
      const analytics2 = getSyncAnalytics();
      expect(analytics1).toBe(analytics2);
    });

    it('should return an instance of SyncAnalyticsService', () => {
      expect(analytics).toBeInstanceOf(SyncAnalyticsService);
    });

    it('should initialize without errors', async () => {
      await expect(analytics.initialize()).resolves.toBeUndefined();
    });

    it('should initialize with partial config', async () => {
      await expect(
        analytics.initialize({
          eventSamplingRate: 0.5,
          detailedMetricsRetention: 14,
        })
      ).resolves.toBeUndefined();
    });

    it('should only initialize once even if called multiple times', async () => {
      await analytics.initialize();
      // Second call should be a no-op (early return)
      await expect(analytics.initialize()).resolves.toBeUndefined();
    });
  });

  describe('ANALYTICS_PRESETS', () => {
    it('should have testing preset', () => {
      expect(ANALYTICS_PRESETS.testing).toBeDefined();
      expect(ANALYTICS_PRESETS.testing.samplingRate).toBe(1.0);
      expect(ANALYTICS_PRESETS.testing.enableRealTimeAlerts).toBe(false);
    });

    it('should have development preset', () => {
      expect(ANALYTICS_PRESETS.development).toBeDefined();
      expect(ANALYTICS_PRESETS.development.samplingRate).toBe(1.0);
      expect(ANALYTICS_PRESETS.development.enableRealTimeAlerts).toBe(true);
    });

    it('should have production preset', () => {
      expect(ANALYTICS_PRESETS.production).toBeDefined();
      expect(ANALYTICS_PRESETS.production.samplingRate).toBe(0.1);
      expect(ANALYTICS_PRESETS.production.enableRealTimeAlerts).toBe(true);
    });
  });

  describe('Event Recording', () => {
    it('should record a sync event', async () => {
      await expect(
        analytics.recordEvent({
          type: 'sync_completed',
          status: 'completed',
          collectionName: 'dogs',
          duration: 1500,
          bytesTransferred: 2048,
        })
      ).resolves.toBeUndefined();
    });

    it('should record a failed sync event', async () => {
      await expect(
        analytics.recordEvent({
          type: 'sync_failed',
          status: 'failed',
          collectionName: 'shows',
          errorMessage: 'Network timeout',
        })
      ).resolves.toBeUndefined();
    });

    it('should record events with metadata', async () => {
      await expect(
        analytics.recordEvent({
          type: 'sync_completed',
          status: 'completed',
          metadata: { latency: 45, queuedOffline: true },
        })
      ).resolves.toBeUndefined();
    });

    it('should record offline mode events', async () => {
      await expect(
        analytics.recordEvent({
          type: 'offline_mode_entered',
          status: 'completed',
        })
      ).resolves.toBeUndefined();

      await expect(
        analytics.recordEvent({
          type: 'offline_mode_exited',
          status: 'completed',
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('Conflict Resolution Recording', () => {
    it('should record a conflict resolution', async () => {
      await expect(
        analytics.recordConflictResolution({
          conflictId: 'conflict-1',
          type: 'update_update',
          strategy: 'last_write_wins',
          resolvedAt: new Date(),
          resolvedBy: 'system',
          originalValue: { name: 'Old' },
          resolvedValue: { name: 'New' },
          fieldPath: 'name',
          recordId: 'record-1',
          collectionName: 'dogs',
        })
      ).resolves.toBeUndefined();
    });

    it('should record multiple conflict resolutions', async () => {
      const conflicts = [
        {
          conflictId: 'c1',
          type: 'update_update' as const,
          strategy: 'last_write_wins' as const,
          resolvedAt: new Date(),
          resolvedBy: 'system',
          originalValue: { v: 1 },
          resolvedValue: { v: 2 },
          fieldPath: 'v',
          recordId: 'r1',
          collectionName: 'dogs',
        },
        {
          conflictId: 'c2',
          type: 'delete_update' as const,
          strategy: 'manual_resolution' as const,
          resolvedAt: new Date(),
          resolvedBy: 'user-1',
          originalValue: { v: 3 },
          resolvedValue: { v: 4 },
          fieldPath: 'v',
          recordId: 'r2',
          collectionName: 'shows',
        },
      ];

      for (const conflict of conflicts) {
        await analytics.recordConflictResolution(conflict);
      }
    });
  });

  describe('Benchmark Recording', () => {
    it('should record a performance benchmark', async () => {
      await expect(
        analytics.recordBenchmark({
          operation: 'upload',
          targetTime: 3000,
          actualTime: 2500,
          recordCount: 50,
          timestamp: new Date(),
          performanceRatio: 2500 / 3000,
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('Metrics Retrieval', () => {
    it('should return metrics for a time range', async () => {
      // Initialize to load mock data
      await analytics.initialize();

      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

      const metrics = await analytics.getMetrics(startTime, endTime);

      expect(metrics).toHaveProperty('syncHealthScore');
      expect(metrics).toHaveProperty('successRate');
      expect(metrics).toHaveProperty('averageSyncTime');
      expect(metrics).toHaveProperty('totalSyncs');
      expect(metrics).toHaveProperty('successfulSyncs');
      expect(metrics).toHaveProperty('failedSyncs');
      expect(metrics).toHaveProperty('totalConflicts');
      expect(metrics).toHaveProperty('resolvedConflicts');
      expect(metrics).toHaveProperty('pendingConflicts');
      expect(metrics).toHaveProperty('conflictRate');
      expect(metrics).toHaveProperty('bandwidthUsed');
      expect(metrics).toHaveProperty('compressionRatio');
      expect(metrics).toHaveProperty('averageLatency');
      expect(metrics).toHaveProperty('offlineUsageTime');
      expect(metrics).toHaveProperty('offlineSyncsQueued');
      expect(metrics).toHaveProperty('collectionMetrics');
      expect(metrics).toHaveProperty('recentEvents');
      expect(metrics).toHaveProperty('syncTimeTrend');
      expect(metrics).toHaveProperty('successRateTrend');
      expect(metrics).toHaveProperty('conflictRateTrend');
      expect(metrics).toHaveProperty('bandwidthTrend');
    });

    it('should return correct start and end times in metrics', async () => {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 60 * 60 * 1000); // 1 hour ago

      const metrics = await analytics.getMetrics(startTime, endTime);

      expect(metrics.startTime).toEqual(startTime);
      expect(metrics.endTime).toEqual(endTime);
    });

    it('should return zero metrics for an empty time range', async () => {
      // Use a time range in the distant future where no events exist
      const startTime = new Date('2099-01-01');
      const endTime = new Date('2099-01-02');

      const metrics = await analytics.getMetrics(startTime, endTime);

      expect(metrics.totalSyncs).toBe(0);
      expect(metrics.successfulSyncs).toBe(0);
      expect(metrics.failedSyncs).toBe(0);
      expect(metrics.averageSyncTime).toBe(0);
      expect(metrics.bandwidthUsed).toBe(0);
    });

    it('should count completed events as successful syncs', async () => {
      // Record several events
      await analytics.recordEvent({
        type: 'sync_completed',
        status: 'completed',
        collectionName: 'dogs',
        duration: 1000,
      });
      await analytics.recordEvent({
        type: 'sync_completed',
        status: 'completed',
        collectionName: 'dogs',
        duration: 2000,
      });
      await analytics.recordEvent({
        type: 'sync_failed',
        status: 'failed',
        collectionName: 'dogs',
      });

      const now = new Date();
      const startTime = new Date(now.getTime() - 60 * 1000); // 1 minute ago
      const endTime = new Date(now.getTime() + 60 * 1000); // 1 minute in future

      const metrics = await analytics.getMetrics(startTime, endTime);

      expect(metrics.successfulSyncs).toBe(2);
      expect(metrics.failedSyncs).toBe(1);
      expect(metrics.totalSyncs).toBe(3);
    });

    it('should calculate success rate correctly', async () => {
      await analytics.recordEvent({
        type: 'sync_completed',
        status: 'completed',
      });
      await analytics.recordEvent({
        type: 'sync_failed',
        status: 'failed',
      });

      const now = new Date();
      const metrics = await analytics.getMetrics(
        new Date(now.getTime() - 60000),
        new Date(now.getTime() + 60000)
      );

      expect(metrics.successRate).toBe(50); // 1 of 2 = 50%
    });

    it('should calculate bandwidth used from events', async () => {
      await analytics.recordEvent({
        type: 'sync_completed',
        status: 'completed',
        bytesTransferred: 1024,
      });
      await analytics.recordEvent({
        type: 'sync_completed',
        status: 'completed',
        bytesTransferred: 2048,
      });

      const now = new Date();
      const metrics = await analytics.getMetrics(
        new Date(now.getTime() - 60000),
        new Date(now.getTime() + 60000)
      );

      expect(metrics.bandwidthUsed).toBe(3072);
    });

    it('should calculate average sync time from completed events', async () => {
      await analytics.recordEvent({
        type: 'sync_completed',
        status: 'completed',
        duration: 2000, // 2 seconds
      });
      await analytics.recordEvent({
        type: 'sync_completed',
        status: 'completed',
        duration: 4000, // 4 seconds
      });

      const now = new Date();
      const metrics = await analytics.getMetrics(
        new Date(now.getTime() - 60000),
        new Date(now.getTime() + 60000)
      );

      // Average of 2s and 4s = 3s
      expect(metrics.averageSyncTime).toBe(3);
    });
  });

  describe('Trend Data', () => {
    it('should include trend arrays with 24 data points', async () => {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

      const metrics = await analytics.getMetrics(startTime, endTime);

      expect(metrics.syncTimeTrend).toHaveLength(24);
      expect(metrics.successRateTrend).toHaveLength(24);
      expect(metrics.conflictRateTrend).toHaveLength(24);
      expect(metrics.bandwidthTrend).toHaveLength(24);
    });

    it('should have timestamp and value in each trend point', async () => {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

      const metrics = await analytics.getMetrics(startTime, endTime);

      for (const point of metrics.syncTimeTrend) {
        expect(point).toHaveProperty('timestamp');
        expect(point).toHaveProperty('value');
        expect(point.timestamp).toBeInstanceOf(Date);
        expect(typeof point.value).toBe('number');
      }
    });
  });

  describe('Collection Metrics', () => {
    it('should return metrics for all collections', async () => {
      await analytics.initialize();

      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

      const metrics = await analytics.getMetrics(startTime, endTime);

      expect(metrics.collectionMetrics).toHaveLength(5);

      const collectionNames = metrics.collectionMetrics.map((c) => c.collectionName);
      expect(collectionNames).toContain('dogs');
      expect(collectionNames).toContain('shows');
      expect(collectionNames).toContain('entries');
      expect(collectionNames).toContain('people');
      expect(collectionNames).toContain('clubs');
    });

    it('should include expected fields for each collection', async () => {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

      const metrics = await analytics.getMetrics(startTime, endTime);

      for (const collection of metrics.collectionMetrics) {
        expect(collection).toHaveProperty('collectionName');
        expect(collection).toHaveProperty('totalRecords');
        expect(collection).toHaveProperty('syncedRecords');
        expect(collection).toHaveProperty('pendingRecords');
        expect(collection).toHaveProperty('conflictedRecords');
        expect(collection).toHaveProperty('averageSyncTime');
        expect(collection).toHaveProperty('successRate');
        expect(collection).toHaveProperty('errorCount');
      }
    });
  });

  describe('Queue Metrics', () => {
    it('should return queue metrics', async () => {
      const queueMetrics = await analytics.getQueueMetrics();

      expect(queueMetrics).toHaveProperty('queueLength');
      expect(queueMetrics).toHaveProperty('processingRate');
      expect(queueMetrics).toHaveProperty('averageWaitTime');
      expect(queueMetrics).toHaveProperty('priorityOperations');
      expect(queueMetrics).toHaveProperty('retryOperations');
      expect(queueMetrics).toHaveProperty('failedOperations');
    });

    it('should return numeric values for queue metrics', async () => {
      const queueMetrics = await analytics.getQueueMetrics();

      expect(typeof queueMetrics.queueLength).toBe('number');
      expect(typeof queueMetrics.processingRate).toBe('number');
      expect(typeof queueMetrics.averageWaitTime).toBe('number');
      expect(typeof queueMetrics.priorityOperations).toBe('number');
    });
  });

  describe('Storage Metrics', () => {
    it('should return storage metrics', async () => {
      const storageMetrics = await analytics.getStorageMetrics();

      expect(storageMetrics).toHaveProperty('totalUsed');
      expect(storageMetrics).toHaveProperty('totalAvailable');
      expect(storageMetrics).toHaveProperty('usageByCollection');
      expect(storageMetrics).toHaveProperty('cacheSize');
      expect(storageMetrics).toHaveProperty('indexSize');
    });

    it('should report correct collection usage keys', async () => {
      const storageMetrics = await analytics.getStorageMetrics();

      expect(storageMetrics.usageByCollection).toHaveProperty('dogs');
      expect(storageMetrics.usageByCollection).toHaveProperty('shows');
      expect(storageMetrics.usageByCollection).toHaveProperty('entries');
      expect(storageMetrics.usageByCollection).toHaveProperty('people');
      expect(storageMetrics.usageByCollection).toHaveProperty('clubs');
    });

    it('should have totalUsed greater than zero', async () => {
      const storageMetrics = await analytics.getStorageMetrics();
      expect(storageMetrics.totalUsed).toBeGreaterThan(0);
    });

    it('should have totalAvailable greater than totalUsed', async () => {
      const storageMetrics = await analytics.getStorageMetrics();
      expect(storageMetrics.totalAvailable).toBeGreaterThan(storageMetrics.totalUsed);
    });
  });

  describe('Alert System', () => {
    it('should start with no active alerts', () => {
      const alerts = analytics.getActiveAlerts();
      expect(alerts).toEqual([]);
    });

    it('should create alert on performance event exceeding threshold', async () => {
      // Initialize with a low syncTimeThreshold so our event triggers an alert
      await analytics.initialize({ syncTimeThreshold: 1 }); // 1 second

      await analytics.recordEvent({
        type: 'sync_completed',
        status: 'completed',
        duration: 5000, // 5 seconds, exceeds 1s threshold
      });

      const alerts = analytics.getActiveAlerts();
      expect(alerts.length).toBeGreaterThanOrEqual(1);
      expect(alerts.some((a) => a.type === 'performance')).toBe(true);
    });

    it('should create alert on failed sync event', async () => {
      await analytics.initialize();

      await analytics.recordEvent({
        type: 'sync_failed',
        status: 'failed',
        errorMessage: 'Connection refused',
      });

      const alerts = analytics.getActiveAlerts();
      expect(alerts.length).toBeGreaterThanOrEqual(1);
      expect(alerts.some((a) => a.type === 'health')).toBe(true);
    });

    it('should acknowledge an alert', async () => {
      await analytics.initialize({ syncTimeThreshold: 1 });

      await analytics.recordEvent({
        type: 'sync_completed',
        status: 'completed',
        duration: 5000,
      });

      const alerts = analytics.getActiveAlerts();
      expect(alerts.length).toBeGreaterThan(0);

      const alertId = alerts[0].id;
      await analytics.acknowledgeAlert(alertId);

      // Alert should still be active (acknowledged != resolved)
      const activeAlerts = analytics.getActiveAlerts();
      const acknowledgedAlert = activeAlerts.find((a) => a.id === alertId);
      expect(acknowledgedAlert).toBeDefined();
      expect(acknowledgedAlert!.acknowledgedAt).toBeInstanceOf(Date);
    });

    it('should resolve an alert', async () => {
      await analytics.initialize({ syncTimeThreshold: 1 });

      await analytics.recordEvent({
        type: 'sync_completed',
        status: 'completed',
        duration: 5000,
      });

      const alertsBefore = analytics.getActiveAlerts();
      expect(alertsBefore.length).toBeGreaterThan(0);

      const alertId = alertsBefore[0].id;
      await analytics.resolveAlert(alertId);

      // After resolving, the alert should no longer be active
      const alertsAfter = analytics.getActiveAlerts();
      expect(alertsAfter.find((a) => a.id === alertId)).toBeUndefined();
    });
  });

  describe('Health Checks', () => {
    it('should return health check results', async () => {
      const healthChecks = await analytics.getHealthChecks();

      expect(healthChecks).toHaveLength(3);

      const serviceNames = healthChecks.map((h) => h.service);
      expect(serviceNames).toContain('Sync Service');
      expect(serviceNames).toContain('Database');
      expect(serviceNames).toContain('Network');
    });

    it('should have proper structure for each health check', async () => {
      const healthChecks = await analytics.getHealthChecks();

      for (const check of healthChecks) {
        expect(check).toHaveProperty('service');
        expect(check).toHaveProperty('status');
        expect(check).toHaveProperty('responseTime');
        expect(check).toHaveProperty('lastChecked');
        expect(check).toHaveProperty('uptime');
        expect(['healthy', 'degraded', 'unhealthy']).toContain(check.status);
        expect(typeof check.responseTime).toBe('number');
        expect(typeof check.uptime).toBe('number');
      }
    });
  });

  describe('Data Export', () => {
    it('should export data as JSON blob', async () => {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

      const blob = await analytics.exportData(startTime, endTime, 'json');

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('application/json');
    });

    it('should export data as CSV blob', async () => {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

      const blob = await analytics.exportData(startTime, endTime, 'csv');

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('text/csv');
    });

    it('should default to JSON format when no format specified', async () => {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

      const blob = await analytics.exportData(startTime, endTime);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('application/json');
    });
  });

  describe('Event Emission', () => {
    it('should call logger.debug when emitting events', () => {
      analytics.emit('test:event', { foo: 'bar' });

      expect(logger.debug).toHaveBeenCalledWith(
        'Analytics event: test:event',
        { foo: 'bar' }
      );
    });
  });
});

describe('getSyncAnalytics', () => {
  beforeEach(() => {
    // Reset singleton for isolation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (SyncAnalyticsService as any).instance = undefined;
  });

  it('should return a SyncAnalyticsService instance', () => {
    const analytics = getSyncAnalytics();
    expect(analytics).toBeInstanceOf(SyncAnalyticsService);
  });

  it('should return the same instance on multiple calls', () => {
    const a1 = getSyncAnalytics();
    const a2 = getSyncAnalytics();
    expect(a1).toBe(a2);
  });
});

/**
 * Sync Analytics Service
 *
 * Comprehensive analytics service for monitoring sync operations, tracking performance metrics,
 * and providing real-time insights into sync health and behavior patterns.
 *
 * Pure helper functions live in `./sync-analytics-helpers.ts`.
 * Type aliases live in `./sync-analytics-types.ts`.
 */

import type {
  SyncEvent,
  SyncMetrics,
  CollectionSyncMetrics,
  ConflictResolution,
  AnalyticsConfig,
  SyncAlert,
  PerformanceBenchmark,
  StorageMetrics,
  SyncQueueMetrics,
  HealthCheckResult
} from '../../types/analytics-types';
import {
  conflictManager,
  type ConflictEvent
} from '@myk9/replication';
import { logger } from '@myk9/core';
import {
  calculateHealthScore,
  generateTrendData,
  calculateAverageLatency,
  calculateOfflineUsage,
  calculateOfflineQueuedSyncs,
  convertMetricsToCSV,
  generateAnalyticsId,
  generateMockAnalyticsData,
} from './sync-analytics-helpers';

// Re-export types for backward compatibility
export type { DetailedSyncMetrics, SyncHealthScore, SyncTrend } from './sync-analytics-types';
export type { PerformanceBenchmark } from '../../types/analytics-types';

/**
 * Main analytics service class providing comprehensive sync monitoring capabilities
 */
export class SyncAnalyticsService {
  private static instance: SyncAnalyticsService;
  private events: SyncEvent[] = [];
  private conflicts: ConflictResolution[] = [];
  private benchmarks: PerformanceBenchmark[] = [];
  private alerts: SyncAlert[] = [];
  private config: AnalyticsConfig;
  private isInitialized = false;

  // Default configuration
  private defaultConfig: AnalyticsConfig = {
    detailedMetricsRetention: 30, // 30 days
    aggregatedMetricsRetention: 365, // 1 year
    eventSamplingRate: 1.0, // 100% sampling
    metricsSamplingRate: 1.0, // 100% sampling
    healthScoreThreshold: 80,
    successRateThreshold: 90,
    conflictRateThreshold: 10,
    syncTimeThreshold: 10, // 10 seconds
    targetSyncTime: 3, // 3 seconds
    targetSuccessRate: 95, // 95%
    targetConflictRate: 2 // 2%
  };

  private constructor() {
    this.config = { ...this.defaultConfig };
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): SyncAnalyticsService {
    if (!SyncAnalyticsService.instance) {
      SyncAnalyticsService.instance = new SyncAnalyticsService();
    }
    return SyncAnalyticsService.instance;
  }

  /**
   * Initialize the analytics service
   */
  public async initialize(config?: Partial<AnalyticsConfig>): Promise<void> {
    if (this.isInitialized) return;

    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Load persisted data
    await this.loadPersistedData();

    // Set up data cleanup intervals
    this.setupCleanupSchedule();

    // Subscribe to conflict events
    this.setupConflictListeners();

    this.isInitialized = true;
  }

  /**
   * Set up listeners for shared conflict manager
   */
  private setupConflictListeners(): void {
    conflictManager.addEventListener('conflict_detected', (event: ConflictEvent) => {
      this.recordEvent({
        type: 'conflict_detected',
        status: 'pending',
        conflictType: 'update_update', // Default
        metadata: { ...event.data, conflictId: event.conflictId }
      });
    });

    conflictManager.addEventListener('conflict_resolved', (event: ConflictEvent) => {
      this.recordEvent({
        type: 'conflict_resolved',
        status: 'completed',
        metadata: { conflictId: event.conflictId }
      });

      // Also record in specialized conflict history if needed
      const conflict = conflictManager.getResolutionHistory().find(c => c.id === event.conflictId);
      if (conflict) {
        this.recordConflictResolution({
          conflictId: conflict.id,
          type: 'update_update',
          strategy: 'last_write_wins',
          resolvedAt: conflict.resolution?.resolvedAt || new Date(),
          resolvedBy: conflict.resolution?.resolvedBy || 'system',
          originalValue: conflict.localData,
          resolvedValue: conflict.resolution?.resolvedEntity,
          fieldPath: 'unknown',
          recordId: conflict.entityId,
          collectionName: conflict.entityType || 'unknown'
        });
      }
    });

    conflictManager.addEventListener('manual_resolution_required', (event: ConflictEvent) => {
      this.recordEvent({
        type: 'conflict_detected',
        status: 'conflict_resolution_required',
        metadata: { ...event.data, conflictId: event.conflictId, manual: true }
      });
    });
  }

  /**
   * Record a sync event
   */
  public async recordEvent(event: Omit<SyncEvent, 'id' | 'timestamp'>): Promise<void> {
    if (Math.random() > this.config.eventSamplingRate) {
      return; // Skip based on sampling rate
    }

    const fullEvent: SyncEvent = {
      ...event,
      id: generateAnalyticsId(),
      timestamp: new Date()
    };

    this.events.push(fullEvent);
    await this.persistEvent(fullEvent);

    // Check for alerts
    await this.checkAlerts(fullEvent);
  }

  /**
   * Record a conflict resolution
   */
  public async recordConflictResolution(resolution: ConflictResolution): Promise<void> {
    this.conflicts.push(resolution);
    await this.persistConflictResolution(resolution);
  }

  /**
   * Record a performance benchmark
   */
  public async recordBenchmark(benchmark: PerformanceBenchmark): Promise<void> {
    this.benchmarks.push(benchmark);
    await this.persistBenchmark(benchmark);
  }

  /**
   * Emit events for real-time monitoring
   */
  public emit(eventType: string, data: unknown): void {
    // This is a placeholder for event emission functionality
    // In a real implementation, this would use EventEmitter or similar
    logger.debug(`Analytics event: ${eventType}`, data);
  }

  /**
   * Get comprehensive metrics for a time range
   */
  public async getMetrics(startTime: Date, endTime: Date): Promise<SyncMetrics> {
    const filteredEvents = this.events.filter(
      event => event.timestamp >= startTime && event.timestamp <= endTime
    );

    const totalSyncs = filteredEvents.filter(e =>
      e.status === 'completed' || e.status === 'failed'
    ).length;

    const successfulSyncs = filteredEvents.filter(e =>
      e.status === 'completed'
    ).length;

    const failedSyncs = filteredEvents.filter(e =>
      e.status === 'failed'
    ).length;

    const syncTimes = filteredEvents
      .filter(e => e.duration && e.status === 'completed')
      .map(e => e.duration! / 1000); // Convert to seconds

    const averageSyncTime = syncTimes.length > 0
      ? syncTimes.reduce((a, b) => a + b, 0) / syncTimes.length
      : 0;

    const successRate = totalSyncs > 0 ? (successfulSyncs / totalSyncs) * 100 : 100;

    const conflictsInRange = this.conflicts.filter(
      c => c.resolvedAt >= startTime && c.resolvedAt <= endTime
    );

    const totalConflicts = conflictsInRange.length;
    const resolvedConflicts = conflictsInRange.filter(c => c.resolvedAt).length;
    const conflictRate = totalSyncs > 0 ? (totalConflicts / totalSyncs) * 100 : 0;

    // Calculate bandwidth usage
    const bandwidthUsed = filteredEvents
      .filter(e => e.bytesTransferred)
      .reduce((total, e) => total + (e.bytesTransferred || 0), 0);

    // Mock compression ratio - in real implementation, this would be calculated
    const compressionRatio = 0.7; // 70% compression

    // Calculate health score based on multiple factors
    const syncHealthScore = calculateHealthScore(
      { successRate, averageSyncTime, conflictRate, totalSyncs },
      this.config
    );

    // Generate collection metrics
    const collectionMetrics = await this.getCollectionMetrics(startTime, endTime);

    // Generate trend data
    const trendData = generateTrendData(filteredEvents, startTime, endTime);

    return {
      startTime,
      endTime,
      syncHealthScore,
      successRate,
      averageSyncTime,
      totalSyncs,
      successfulSyncs,
      failedSyncs,
      totalConflicts,
      resolvedConflicts,
      pendingConflicts: totalConflicts - resolvedConflicts,
      conflictRate,
      bandwidthUsed,
      compressionRatio,
      averageLatency: calculateAverageLatency(filteredEvents),
      offlineUsageTime: calculateOfflineUsage(filteredEvents),
      offlineSyncsQueued: calculateOfflineQueuedSyncs(filteredEvents),
      collectionMetrics,
      recentEvents: filteredEvents.slice(-50), // Last 50 events
      syncTimeTrend: trendData.syncTimeTrend,
      successRateTrend: trendData.successRateTrend,
      conflictRateTrend: trendData.conflictRateTrend,
      bandwidthTrend: trendData.bandwidthTrend
    };
  }

  /**
   * Get current sync queue metrics
   */
  public async getQueueMetrics(): Promise<SyncQueueMetrics> {
    // Mock implementation - in real scenario, this would query the actual sync queue
    const now = new Date();
    const recentEvents = this.events.filter(
      e => now.getTime() - e.timestamp.getTime() < 300000 // Last 5 minutes
    );

    return {
      queueLength: Math.floor(Math.random() * 20),
      processingRate: recentEvents.length * 12, // extrapolate to per hour
      averageWaitTime: 2500,
      priorityOperations: Math.floor(Math.random() * 5),
      retryOperations: Math.floor(Math.random() * 3),
      failedOperations: this.events.filter(e => e.status === 'failed').length,
      lastProcessedAt: recentEvents.length > 0 ? recentEvents[recentEvents.length - 1].timestamp : undefined
    };
  }

  /**
   * Get storage usage metrics
   */
  public async getStorageMetrics(): Promise<StorageMetrics> {
    // Mock implementation - in real scenario, this would query IndexedDB usage
    const mockUsage = {
      dogs: 2.5 * 1024 * 1024, // 2.5 MB
      shows: 1.8 * 1024 * 1024, // 1.8 MB
      entries: 3.2 * 1024 * 1024, // 3.2 MB
      people: 1.5 * 1024 * 1024, // 1.5 MB
      clubs: 0.8 * 1024 * 1024   // 0.8 MB
    };

    const totalUsed = Object.values(mockUsage).reduce((a, b) => a + b, 0);
    const cacheSize = 512 * 1024; // 512 KB
    const indexSize = 128 * 1024; // 128 KB

    return {
      totalUsed: totalUsed + cacheSize + indexSize,
      totalAvailable: 100 * 1024 * 1024, // 100 MB limit
      usageByCollection: mockUsage,
      cacheSize,
      indexSize,
      lastCleanupAt: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
    };
  }

  /**
   * Get active alerts
   */
  public getActiveAlerts(): SyncAlert[] {
    return this.alerts.filter(alert => !alert.resolvedAt);
  }

  /**
   * Acknowledge an alert
   */
  public async acknowledgeAlert(alertId: string): Promise<void> {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledgedAt = new Date();
      await this.persistAlert(alert);
    }
  }

  /**
   * Resolve an alert
   */
  public async resolveAlert(alertId: string): Promise<void> {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolvedAt = new Date();
      await this.persistAlert(alert);
    }
  }

  /**
   * Get health check results
   */
  public async getHealthChecks(): Promise<HealthCheckResult[]> {
    // Mock implementation - in real scenario, this would perform actual health checks
    return [
      {
        service: 'Sync Service',
        status: 'healthy',
        responseTime: 150,
        lastChecked: new Date(),
        uptime: 99.9
      },
      {
        service: 'Database',
        status: 'healthy',
        responseTime: 45,
        lastChecked: new Date(),
        uptime: 99.95
      },
      {
        service: 'Network',
        status: 'healthy',
        responseTime: 25,
        lastChecked: new Date(),
        uptime: 98.5
      }
    ];
  }

  /**
   * Export analytics data
   */
  public async exportData(
    startTime: Date,
    endTime: Date,
    format: 'json' | 'csv' = 'json'
  ): Promise<Blob> {
    const metrics = await this.getMetrics(startTime, endTime);

    if (format === 'json') {
      return new Blob([JSON.stringify(metrics, null, 2)], {
        type: 'application/json'
      });
    } else {
      // CSV export implementation
      const csv = convertMetricsToCSV(metrics);
      return new Blob([csv], { type: 'text/csv' });
    }
  }

  /**
   * Generate collection-specific metrics
   */
  private async getCollectionMetrics(
    startTime: Date,
    endTime: Date
  ): Promise<CollectionSyncMetrics[]> {
    const collections = ['dogs', 'shows', 'entries', 'people', 'clubs'];

    return collections.map(collectionName => {
      const collectionEvents = this.events.filter(
        e => e.collectionName === collectionName &&
          e.timestamp >= startTime &&
          e.timestamp <= endTime
      );

      const totalRecords = collectionEvents.reduce(
        (sum, e) => sum + (e.recordCount || 0), 0
      );

      const successfulEvents = collectionEvents.filter(e => e.status === 'completed');
      const syncedRecords = successfulEvents.reduce(
        (sum, e) => sum + (e.recordCount || 0), 0
      );

      const syncTimes = successfulEvents
        .filter(e => e.duration)
        .map(e => e.duration!);

      const averageSyncTime = syncTimes.length > 0
        ? syncTimes.reduce((a, b) => a + b, 0) / syncTimes.length
        : 0;

      const successRate = collectionEvents.length > 0
        ? (successfulEvents.length / collectionEvents.length) * 100
        : 100;

      return {
        collectionName,
        totalRecords,
        syncedRecords,
        pendingRecords: totalRecords - syncedRecords,
        conflictedRecords: this.conflicts.filter(c => c.collectionName === collectionName).length,
        lastSyncAt: collectionEvents.length > 0
          ? collectionEvents[collectionEvents.length - 1].timestamp
          : undefined,
        averageSyncTime,
        successRate,
        errorCount: collectionEvents.filter(e => e.status === 'failed').length
      };
    });
  }

  /**
   * Check for alert conditions
   */
  private async checkAlerts(event: SyncEvent): Promise<void> {

    // Check for performance alerts
    if (event.duration && event.duration > this.config.syncTimeThreshold * 1000) {
      await this.createAlert({
        type: 'performance',
        severity: 'medium',
        title: 'Slow Sync Operation',
        description: `Sync operation took ${(event.duration / 1000).toFixed(1)}s, exceeding threshold of ${this.config.syncTimeThreshold}s`,
        metadata: { eventId: event.id, duration: event.duration }
      });
    }

    // Check for failure alerts
    if (event.status === 'failed') {
      await this.createAlert({
        type: 'health',
        severity: 'high',
        title: 'Sync Operation Failed',
        description: `Sync failed: ${event.errorMessage || 'Unknown error'}`,
        metadata: { eventId: event.id, errorMessage: event.errorMessage }
      });
    }
  }

  /**
   * Create a new alert
   */
  private async createAlert(alertData: {
    type: SyncAlert['type'];
    severity: SyncAlert['severity'];
    title: string;
    description: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const alert: SyncAlert = {
      id: generateAnalyticsId(),
      ...alertData,
      triggeredAt: new Date()
    };

    this.alerts.push(alert);
    await this.persistAlert(alert);
  }

  /**
   * Persist event to storage
   */
  private async persistEvent(_event: SyncEvent): Promise<void> {
    // In real implementation, this would save to IndexedDB
    // For now, just store in memory
  }

  /**
   * Persist conflict resolution to storage
   */
  private async persistConflictResolution(_resolution: ConflictResolution): Promise<void> {
    // In real implementation, this would save to IndexedDB
  }

  /**
   * Persist benchmark to storage
   */
  private async persistBenchmark(_benchmark: PerformanceBenchmark): Promise<void> {
    // In real implementation, this would save to IndexedDB
  }

  /**
   * Persist alert to storage
   */
  private async persistAlert(_alert: SyncAlert): Promise<void> {
    // In real implementation, this would save to IndexedDB
  }

  /**
   * Load persisted data from storage
   */
  private async loadPersistedData(): Promise<void> {
    // In real implementation, this would load from IndexedDB
    // For now, generate some mock data for demo purposes
    const mockData = generateMockAnalyticsData();
    this.events.push(...mockData.events);
    this.conflicts.push(...mockData.conflicts);
  }

  /**
   * Set up periodic cleanup of old data
   */
  private setupCleanupSchedule(): void {
    // Clean up old data every hour
    setInterval(() => {
      this.cleanupOldData();
    }, 60 * 60 * 1000); // 1 hour
  }

  /**
   * Clean up old data based on retention policies
   */
  private cleanupOldData(): void {
    const now = new Date();
    const retentionCutoff = new Date(
      now.getTime() - this.config.detailedMetricsRetention * 24 * 60 * 60 * 1000
    );

    // Remove old events
    this.events = this.events.filter(event => event.timestamp > retentionCutoff);

    // Remove old conflicts
    this.conflicts = this.conflicts.filter(conflict => conflict.resolvedAt > retentionCutoff);

    // Remove old benchmarks
    this.benchmarks = this.benchmarks.filter(benchmark => benchmark.timestamp > retentionCutoff);

    // Remove resolved alerts older than 7 days
    const alertCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    this.alerts = this.alerts.filter(alert =>
      !alert.resolvedAt || alert.resolvedAt > alertCutoff
    );
  }
}

// Utility function for getting analytics instance
export function getSyncAnalytics(): SyncAnalyticsService {
  return SyncAnalyticsService.getInstance();
}

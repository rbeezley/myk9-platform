/**
 * Sync Analytics Helper Functions
 *
 * Pure, stateless utility functions used by SyncAnalyticsService for computing
 * metrics, generating trend data, and formatting analytics output.
 */

import type {
  SyncEvent,
  SyncMetrics,
  ConflictResolution,
  AnalyticsConfig,
} from '../../types/analytics-types';
import type { HealthScoreFactors } from './sync-analytics-types';

/**
 * Calculate a composite health score (0-100) based on multiple weighted factors.
 */
export function calculateHealthScore(
  factors: HealthScoreFactors,
  config: Pick<AnalyticsConfig, 'targetSyncTime' | 'targetConflictRate'>
): number {
  const { successRate, averageSyncTime, conflictRate, totalSyncs } = factors;

  // Weight different factors
  const successWeight = 0.4;
  const performanceWeight = 0.3;
  const conflictWeight = 0.2;
  const volumeWeight = 0.1;

  // Calculate component scores (0-100)
  const successScore = successRate;
  const performanceScore = Math.max(0, 100 - (averageSyncTime / config.targetSyncTime) * 100);
  const conflictScore = Math.max(0, 100 - (conflictRate / config.targetConflictRate) * 100);
  const volumeScore = Math.min(100, (totalSyncs / 100) * 100); // Normalize to 100 syncs

  const healthScore =
    (successScore * successWeight) +
    (performanceScore * performanceWeight) +
    (conflictScore * conflictWeight) +
    (volumeScore * volumeWeight);

  return Math.round(Math.max(0, Math.min(100, healthScore)));
}

/**
 * Generate time-bucketed trend data for charts.
 *
 * Divides the given time range into 24 equal buckets and calculates aggregate
 * metrics (sync time, success rate, conflict rate, bandwidth) for each bucket.
 */
export function generateTrendData(
  events: SyncEvent[],
  startTime: Date,
  endTime: Date
): {
  syncTimeTrend: Array<{ timestamp: Date; value: number }>;
  successRateTrend: Array<{ timestamp: Date; value: number }>;
  conflictRateTrend: Array<{ timestamp: Date; value: number }>;
  bandwidthTrend: Array<{ timestamp: Date; value: number }>;
} {
  const timeRange = endTime.getTime() - startTime.getTime();
  const bucketSize = timeRange / 24; // 24 data points
  const buckets: Array<{
    time: Date;
    events: SyncEvent[];
  }> = [];

  // Create time buckets
  for (let i = 0; i < 24; i++) {
    const bucketStart = new Date(startTime.getTime() + (i * bucketSize));
    const bucketEnd = new Date(startTime.getTime() + ((i + 1) * bucketSize));
    const bucketEvents = events.filter(
      e => e.timestamp >= bucketStart && e.timestamp < bucketEnd
    );

    buckets.push({
      time: bucketStart,
      events: bucketEvents
    });
  }

  // Calculate trend metrics for each bucket
  const syncTimeTrend = buckets.map(bucket => {
    const syncTimes = bucket.events
      .filter(e => e.duration && e.status === 'completed')
      .map(e => e.duration! / 1000);

    const avgTime = syncTimes.length > 0
      ? syncTimes.reduce((a, b) => a + b, 0) / syncTimes.length
      : 0;

    return {
      timestamp: bucket.time,
      value: avgTime
    };
  });

  const successRateTrend = buckets.map(bucket => {
    const total = bucket.events.filter(e =>
      e.status === 'completed' || e.status === 'failed'
    ).length;
    const successful = bucket.events.filter(e =>
      e.status === 'completed'
    ).length;

    const rate = total > 0 ? (successful / total) * 100 : 100;

    return {
      timestamp: bucket.time,
      value: rate
    };
  });

  const conflictRateTrend = buckets.map(bucket => {
    const syncEvents = bucket.events.filter(e =>
      e.status === 'completed' || e.status === 'failed'
    );
    const conflicts = bucket.events.filter(e =>
      e.type === 'conflict_detected'
    );

    const rate = syncEvents.length > 0 ? (conflicts.length / syncEvents.length) * 100 : 0;

    return {
      timestamp: bucket.time,
      value: rate
    };
  });

  const bandwidthTrend = buckets.map(bucket => {
    const totalBytes = bucket.events.reduce(
      (sum, e) => sum + (e.bytesTransferred || 0), 0
    );

    return {
      timestamp: bucket.time,
      value: totalBytes / 1024 / 1024 // Convert to MB
    };
  });

  return {
    syncTimeTrend,
    successRateTrend,
    conflictRateTrend,
    bandwidthTrend
  };
}

/**
 * Calculate average latency from events that contain latency metadata.
 */
export function calculateAverageLatency(events: SyncEvent[]): number {
  const latencyEvents = events.filter(e => e.metadata?.latency);
  if (latencyEvents.length === 0) return 0;

  const totalLatency = latencyEvents.reduce(
    (sum, e) => {
      const latency = e.metadata?.latency;
      return sum + (typeof latency === 'number' ? latency : 0);
    }, 0
  );

  return totalLatency / latencyEvents.length;
}

/**
 * Calculate total offline usage time (in minutes) by pairing
 * offline_mode_entered / offline_mode_exited events.
 */
export function calculateOfflineUsage(events: SyncEvent[]): number {
  const offlineEvents = events.filter(e => e.type === 'offline_mode_entered');
  const onlineEvents = events.filter(e => e.type === 'offline_mode_exited');

  let totalOfflineTime = 0;

  for (let i = 0; i < offlineEvents.length; i++) {
    const offlineStart = offlineEvents[i].timestamp;
    const onlineRestore = onlineEvents.find(e => e.timestamp > offlineStart);

    if (onlineRestore) {
      totalOfflineTime += onlineRestore.timestamp.getTime() - offlineStart.getTime();
    }
  }

  return totalOfflineTime / (1000 * 60); // Convert to minutes
}

/**
 * Count events that were queued while offline.
 */
export function calculateOfflineQueuedSyncs(events: SyncEvent[]): number {
  return events.filter(e => e.metadata?.queuedOffline).length;
}

/**
 * Convert SyncMetrics to a CSV string for export.
 */
export function convertMetricsToCSV(metrics: SyncMetrics): string {
  const headers = [
    'Metric',
    'Value',
    'Unit',
    'Timestamp'
  ];

  const rows = [
    ['Sync Health Score', metrics.syncHealthScore.toString(), '%', metrics.endTime.toISOString()],
    ['Success Rate', metrics.successRate.toString(), '%', metrics.endTime.toISOString()],
    ['Average Sync Time', metrics.averageSyncTime.toString(), 'seconds', metrics.endTime.toISOString()],
    ['Total Syncs', metrics.totalSyncs.toString(), 'count', metrics.endTime.toISOString()],
    ['Failed Syncs', metrics.failedSyncs.toString(), 'count', metrics.endTime.toISOString()],
    ['Conflict Rate', metrics.conflictRate.toString(), '%', metrics.endTime.toISOString()],
    ['Bandwidth Used', (metrics.bandwidthUsed / 1024 / 1024).toFixed(2), 'MB', metrics.endTime.toISOString()],
    ['Offline Usage', metrics.offlineUsageTime.toString(), 'minutes', metrics.endTime.toISOString()]
  ];

  return [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');
}

/**
 * Generate a unique ID string using timestamp and random suffix.
 */
export function generateAnalyticsId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate mock sync events and conflict resolutions for demonstration purposes.
 *
 * Returns arrays of events and conflicts covering the last 24 hours.
 */
export function generateMockAnalyticsData(): {
  events: SyncEvent[];
  conflicts: ConflictResolution[];
} {
  const now = new Date();
  const events: SyncEvent[] = [];
  const conflicts: ConflictResolution[] = [];

  // Generate mock events for the last 24 hours
  for (let i = 0; i < 100; i++) {
    const timestamp = new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000);
    const collections = ['dogs', 'shows', 'entries', 'people', 'clubs'];

    events.push({
      id: generateAnalyticsId(),
      type: Math.random() > 0.1 ? 'sync_completed' : 'sync_failed',
      timestamp,
      duration: Math.random() * 5000 + 1000, // 1-6 seconds
      status: Math.random() > 0.1 ? 'completed' : 'failed',
      collectionName: collections[Math.floor(Math.random() * collections.length)],
      recordCount: Math.floor(Math.random() * 50) + 1,
      bytesTransferred: Math.floor(Math.random() * 1024 * 1024) + 1024,
      errorMessage: Math.random() > 0.9 ? 'Network timeout' : undefined,
      metadata: {
        latency: Math.random() * 100 + 10
      }
    });
  }

  // Generate mock conflict resolutions
  for (let i = 0; i < 10; i++) {
    const timestamp = new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000);
    const collections = ['dogs', 'shows', 'entries', 'people', 'clubs'];

    conflicts.push({
      conflictId: generateAnalyticsId(),
      type: 'update_update',
      strategy: 'last_write_wins',
      resolvedAt: timestamp,
      resolvedBy: 'system',
      originalValue: { name: 'Old Value' },
      resolvedValue: { name: 'New Value' },
      fieldPath: 'name',
      recordId: generateAnalyticsId(),
      collectionName: collections[Math.floor(Math.random() * collections.length)]
    });
  }

  return { events, conflicts };
}

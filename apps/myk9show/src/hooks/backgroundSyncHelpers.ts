// Pure helper functions for useBackgroundSync

import type { NetworkState, SyncEvent, SyncMetrics } from '@/types/sync-types';

type NetworkQuality = 'excellent' | 'good' | 'slow';

/**
 * Maps a raw network quality string to our constrained NetworkQuality type.
 */
export function mapNetworkQuality(quality: string): NetworkQuality {
  if (quality === 'excellent') return 'excellent';
  if (quality === 'good') return 'good';
  return 'slow';
}

/**
 * Builds a NetworkState from raw network status data.
 */
export function buildNetworkState(
  online: boolean,
  quality: string,
  downlink?: number,
): NetworkState {
  return {
    isOnline: online,
    quality: mapNetworkQuality(quality),
    lastChecked: new Date(),
    bandwidth: downlink,
  };
}

interface SyncStats {
  pendingTasks: number;
  completedTasks: number;
  totalTasks: number;
  averageDuration: number;
  lastSyncAttempt: number;
}

/**
 * Computes SyncMetrics from raw sync statistics.
 */
export function calculateSyncMetrics(stats: SyncStats): SyncMetrics & { lastSyncAt?: Date | undefined } {
  const lastSyncAt = stats.lastSyncAttempt > 0 ? new Date(stats.lastSyncAttempt) : undefined;
  return {
    syncSuccessRate: stats.totalTasks > 0 ? stats.completedTasks / stats.totalTasks : 1,
    averageSyncTime: stats.averageDuration,
    conflictRate: 0,
    offlineUsageTime: 0,
    queueSize: stats.pendingTasks,
    lastSyncAt,
  };
}

/**
 * Creates a SyncEvent from a sync completion result.
 */
export function createSyncCompletionEvent(result: {
  success: boolean;
  timestamp: Date;
  taskId: string;
  attempts: number;
  duration: number;
  error?: string;
}): SyncEvent {
  return {
    type: result.success ? 'sync-completed' : 'sync-failed',
    timestamp: result.timestamp,
    entityType: 'sync-task',
    entityId: result.taskId,
    details: {
      success: result.success,
      attempts: result.attempts,
      duration: result.duration,
      error: result.error,
    },
  };
}

/**
 * Creates a SyncEvent from a sync error.
 */
export function createSyncErrorEvent(error: Error, task: { entity: string; entityId: string }): SyncEvent {
  return {
    type: 'sync-failed',
    timestamp: new Date(),
    entityType: task.entity,
    entityId: task.entityId,
    details: { error: error.message },
  };
}

/**
 * Derives a sync health status label from the success rate.
 */
export function calculateSyncHealthStatus(successRate: number): 'good' | 'warning' | 'error' {
  if (successRate > 0.9) return 'good';
  if (successRate > 0.7) return 'warning';
  return 'error';
}

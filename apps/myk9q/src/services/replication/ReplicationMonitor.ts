/**
 * Replication Monitoring Service
 * Day 27: Production rollout monitoring and health checks
 *
 * Provides real-time metrics for:
 * - Sync success/failure rates
 * - Performance metrics (sync duration, query times)
 * - Storage usage
 * - Error tracking
 */

import { logger } from '@/utils/logger';
import type { SyncResult, PendingMutation } from './types';
import { DB_NAME, DB_VERSION } from './replicationConstants';

export interface ReplicationHealthMetrics {
  // Sync metrics
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  successRate: number; // 0-100

  // Performance metrics
  avgSyncDuration: number; // milliseconds
  maxSyncDuration: number;
  minSyncDuration: number;

  // Storage metrics
  storageUsedMB: number;
  storageQuotaMB: number;
  storageUsagePercent: number;

  // Error tracking
  recentErrors: Array<{
    timestamp: number;
    tableName: string;
    error: string;
  }>;

  // Mutation queue
  pendingMutations: number;
  failedMutations: number;

  // Last sync times per table
  lastSyncTimes: Record<string, number>;
}

export interface PerformanceAlert {
  severity: 'info' | 'warning' | 'error' | 'critical';
  metric: string;
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
}

/**
 * Performance thresholds for alerting
 */
const THRESHOLDS = {
  // Sync success rate (%)
  syncSuccessRate: {
    critical: 90, // < 90% = critical
    warning: 95,  // < 95% = warning
  },

  // Sync duration (ms)
  syncDuration: {
    warning: 10000,  // > 10s = warning
    critical: 30000, // > 30s = critical
  },

  // Storage usage (%)
  storageUsage: {
    warning: 80,  // > 80% = warning
    critical: 90, // > 90% = critical
  },

  // Pending mutations
  pendingMutations: {
    warning: 500,  // > 500 = warning
    critical: 1000, // > 1000 = critical
  },

  // Failed mutations
  failedMutations: {
    warning: 10,   // > 10 = warning
    critical: 50,  // > 50 = critical
  },
};

/**
 * Replication monitoring service
 * Tracks health metrics and generates alerts
 */
export class ReplicationMonitor {
  private syncHistory: SyncResult[] = [];
  private errors: Array<{ timestamp: number; tableName: string; error: string }> = [];
  private alerts: PerformanceAlert[] = [];
  private maxHistorySize = 100; // Keep last 100 syncs
  private maxErrorSize = 50;    // Keep last 50 errors

  /**
   * Record a sync result
   */
  recordSync(result: SyncResult): void {
    this.syncHistory.push(result);

    // Keep history size manageable
    if (this.syncHistory.length > this.maxHistorySize) {
      this.syncHistory = this.syncHistory.slice(-this.maxHistorySize);
    }

    // Record errors
    if (!result.success && result.error) {
      this.recordError(result.tableName, result.error);
    }

    // Check for performance issues
    this.checkPerformance(result);
  }

  /**
   * Record an error
   */
  recordError(tableName: string, error: string): void {
    this.errors.push({
      timestamp: Date.now(),
      tableName,
      error,
    });

    // Keep error size manageable
    if (this.errors.length > this.maxErrorSize) {
      this.errors = this.errors.slice(-this.maxErrorSize);
    }

    logger.error(`[ReplicationMonitor] Error in ${tableName}:`, error);
  }

  /**
   * Check for performance issues and generate alerts
   */
  private checkPerformance(result: SyncResult): void {
    const alerts: PerformanceAlert[] = [];

    // Check sync duration
    if (result.duration > THRESHOLDS.syncDuration.critical) {
      alerts.push({
        severity: 'critical',
        metric: 'sync_duration',
        message: `Sync duration for ${result.tableName} exceeded critical threshold`,
        value: result.duration,
        threshold: THRESHOLDS.syncDuration.critical,
        timestamp: Date.now(),
      });
    } else if (result.duration > THRESHOLDS.syncDuration.warning) {
      alerts.push({
        severity: 'warning',
        metric: 'sync_duration',
        message: `Sync duration for ${result.tableName} exceeded warning threshold`,
        value: result.duration,
        threshold: THRESHOLDS.syncDuration.warning,
        timestamp: Date.now(),
      });
    }

    // Check sync success rate (synchronous calculation for performance)
    const totalSyncs = this.syncHistory.length;
    const successfulSyncs = this.syncHistory.filter(r => r.success).length;
    const successRate = totalSyncs > 0 ? (successfulSyncs / totalSyncs) * 100 : 100;

    if (successRate < THRESHOLDS.syncSuccessRate.critical) {
      alerts.push({
        severity: 'critical',
        metric: 'success_rate',
        message: `Sync success rate dropped below critical threshold`,
        value: successRate,
        threshold: THRESHOLDS.syncSuccessRate.critical,
        timestamp: Date.now(),
      });
    } else if (successRate < THRESHOLDS.syncSuccessRate.warning) {
      alerts.push({
        severity: 'warning',
        metric: 'success_rate',
        message: `Sync success rate dropped below warning threshold`,
        value: successRate,
        threshold: THRESHOLDS.syncSuccessRate.warning,
        timestamp: Date.now(),
      });
    }

    // Store alerts
    this.alerts.push(...alerts);

    // Dispatch alerts as custom events for UI
    alerts.forEach(alert => {
      window.dispatchEvent(new CustomEvent('replication:performance-alert', {
        detail: alert,
      }));

      if (alert.severity === 'critical') {
        logger.error('[ReplicationMonitor] CRITICAL ALERT:', alert.message);
      } else if (alert.severity === 'warning') {
        logger.warn('[ReplicationMonitor] WARNING:', alert.message);
      }
    });
  }

  /**
   * Get current health metrics
   */
  async getHealthMetrics(): Promise<ReplicationHealthMetrics> {
    // Calculate sync metrics
    const totalSyncs = this.syncHistory.length;
    const successfulSyncs = this.syncHistory.filter(r => r.success).length;
    const failedSyncs = totalSyncs - successfulSyncs;
    const successRate = totalSyncs > 0 ? (successfulSyncs / totalSyncs) * 100 : 100;

    // Calculate performance metrics
    const durations = this.syncHistory.map(r => r.duration);
    const avgSyncDuration = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : 0;
    const maxSyncDuration = durations.length > 0 ? Math.max(...durations) : 0;
    const minSyncDuration = durations.length > 0 ? Math.min(...durations) : 0;

    // Calculate storage metrics
    let storageUsedMB = 0;
    let storageQuotaMB = 0;
    let storageUsagePercent = 0;

    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        storageUsedMB = (estimate.usage || 0) / 1024 / 1024;
        storageQuotaMB = (estimate.quota || 0) / 1024 / 1024;
        storageUsagePercent = storageQuotaMB > 0
          ? (storageUsedMB / storageQuotaMB) * 100
          : 0;
      } catch (error) {
        logger.warn('[ReplicationMonitor] Failed to get storage estimate:', error);
      }
    }

    // Get pending mutations count
    let pendingMutations = 0;
    let failedMutations = 0;

    try {
      const { openDB } = await import('idb');
      const db = await openDB(DB_NAME, DB_VERSION);
      const mutations = await db.getAll('pending_mutations');
      pendingMutations = mutations.filter((m: PendingMutation) => m.status === 'pending').length;
      failedMutations = mutations.filter((m: PendingMutation) => m.status === 'failed').length;
    } catch (error) {
      logger.warn('[ReplicationMonitor] Failed to get mutation counts:', error);
    }

    // Get last sync times per table
    const lastSyncTimes: Record<string, number> = {};
    this.syncHistory.forEach(result => {
      if (!lastSyncTimes[result.tableName] || result.success) {
        lastSyncTimes[result.tableName] = Date.now();
      }
    });

    return {
      totalSyncs,
      successfulSyncs,
      failedSyncs,
      successRate,
      avgSyncDuration,
      maxSyncDuration,
      minSyncDuration,
      storageUsedMB,
      storageQuotaMB,
      storageUsagePercent,
      recentErrors: this.errors.slice(-10), // Last 10 errors
      pendingMutations,
      failedMutations,
      lastSyncTimes,
    };
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(limit = 20): PerformanceAlert[] {
    return this.alerts.slice(-limit);
  }

  /**
   * Clear all metrics and alerts
   */
  reset(): void {
    this.syncHistory = [];
    this.errors = [];
    this.alerts = [];
    logger.log('[ReplicationMonitor] Metrics reset');
  }

  /**
   * Generate health report for logging/debugging
   */
  async generateHealthReport(): Promise<string> {
    const metrics = await this.getHealthMetrics();

    const report = `
╔════════════════════════════════════════════════════════════╗
║          REPLICATION SYSTEM HEALTH REPORT                  ║
╠════════════════════════════════════════════════════════════╣
║ Sync Metrics:                                              ║
║   Total Syncs:      ${String(metrics.totalSyncs).padEnd(40)} ║
║   Successful:       ${String(metrics.successfulSyncs).padEnd(40)} ║
║   Failed:           ${String(metrics.failedSyncs).padEnd(40)} ║
║   Success Rate:     ${metrics.successRate.toFixed(2)}%${' '.repeat(34)} ║
║                                                            ║
║ Performance:                                               ║
║   Avg Duration:     ${metrics.avgSyncDuration.toFixed(0)}ms${' '.repeat(36)} ║
║   Max Duration:     ${metrics.maxSyncDuration.toFixed(0)}ms${' '.repeat(36)} ║
║   Min Duration:     ${metrics.minSyncDuration.toFixed(0)}ms${' '.repeat(36)} ║
║                                                            ║
║ Storage:                                                   ║
║   Used:             ${metrics.storageUsedMB.toFixed(2)} MB${' '.repeat(32)} ║
║   Quota:            ${metrics.storageQuotaMB.toFixed(2)} MB${' '.repeat(32)} ║
║   Usage:            ${metrics.storageUsagePercent.toFixed(2)}%${' '.repeat(36)} ║
║                                                            ║
║ Mutations:                                                 ║
║   Pending:          ${String(metrics.pendingMutations).padEnd(40)} ║
║   Failed:           ${String(metrics.failedMutations).padEnd(40)} ║
║                                                            ║
║ Recent Errors:      ${String(metrics.recentErrors.length).padEnd(40)} ║
╚════════════════════════════════════════════════════════════╝
    `.trim();

    return report;
  }

  /**
   * Log health report to console
   */
  async logHealthReport(): Promise<void> {
    // Health report logging removed - call generateHealthReport() directly if needed
    await this.generateHealthReport();
  }
}

// Global monitor instance
let monitorInstance: ReplicationMonitor | null = null;

/**
 * Get global monitor instance
 */
export function getReplicationMonitor(): ReplicationMonitor {
  if (!monitorInstance) {
    monitorInstance = new ReplicationMonitor();
  }
  return monitorInstance;
}

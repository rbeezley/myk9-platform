/**
 * Performance metrics and monitoring types
 * Tracks sync, network, storage, and processing performance
 */

import type { SyncPriority } from './performance-sync-types';

/**
 * Performance metrics for monitoring sync operations
 */
export interface PerformanceMetrics {
  /** Sync operation metrics */
  sync: SyncMetrics;

  /** Network usage metrics */
  network: NetworkMetrics;

  /** Storage metrics */
  storage: StorageMetrics;

  /** Processing metrics */
  processing: ProcessingMetrics;

  /** Error metrics */
  errors: ErrorMetrics;
}

/**
 * Metrics for sync operations
 */
export interface SyncMetrics {
  /** Total number of sync operations */
  totalSyncs: number;

  /** Successful sync operations */
  successfulSyncs: number;

  /** Failed sync operations */
  failedSyncs: number;

  /** Average sync duration (ms) */
  averageDuration: number;

  /** Records synced per second */
  throughput: number;

  /** Sync operations by priority */
  byPriority: Record<SyncPriority, number>;

  /** Last sync timestamp */
  lastSyncTime: Date;
}

/**
 * Network usage metrics
 */
export interface NetworkMetrics {
  /** Total bytes sent */
  bytesSent: number;

  /** Total bytes received */
  bytesReceived: number;

  /** Compression savings (bytes) */
  compressionSavings: number;

  /** Average request size (bytes) */
  averageRequestSize: number;

  /** Average response size (bytes) */
  averageResponseSize: number;

  /** Network errors */
  networkErrors: number;

  /** Average latency (ms) */
  averageLatency: number;
}

/**
 * Storage metrics
 */
export interface StorageMetrics {
  /** Total storage used (bytes) */
  totalUsed: number;

  /** Storage by entity type */
  byEntityType: Record<string, number>;

  /** Cache hit rate */
  cacheHitRate: number;

  /** Number of cached items */
  cachedItems: number;

  /** Storage quota usage percentage */
  quotaUsage: number;
}

/**
 * Processing performance metrics
 */
export interface ProcessingMetrics {
  /** Average diff calculation time (ms) */
  averageDiffTime: number;

  /** Average compression time (ms) */
  averageCompressionTime: number;

  /** Average decompression time (ms) */
  averageDecompressionTime: number;

  /** Queue processing time (ms) */
  queueProcessingTime: number;

  /** CPU usage percentage */
  cpuUsage: number;

  /** Memory usage (MB) */
  memoryUsage: number;
}

/**
 * Error tracking metrics
 */
export interface ErrorMetrics {
  /** Total errors */
  totalErrors: number;

  /** Errors by type */
  byType: Record<string, number>;

  /** Error rate (errors per sync) */
  errorRate: number;

  /** Most recent errors */
  recentErrors: ErrorInfo[];
}

/**
 * Information about a sync error
 */
export interface ErrorInfo {
  /** Error timestamp */
  timestamp: Date;

  /** Error type */
  type: string;

  /** Error message */
  message: string;

  /** Entity type involved */
  entityType?: string;

  /** Operation that failed */
  operation?: string;

  /** Stack trace */
  stack?: string;
}

/**
 * Configuration for performance monitoring
 */
export interface PerformanceMonitoringConfig {
  /** Enable performance monitoring */
  enabled: boolean;

  /** Metrics collection interval (ms) */
  collectionInterval: number;

  /** Metrics retention period (days) */
  retentionDays: number;

  /** Enable detailed logging */
  detailedLogging: boolean;

  /** Performance thresholds for alerts */
  thresholds: PerformanceThresholds;
}

/**
 * Performance thresholds for alerting
 */
export interface PerformanceThresholds {
  /** Maximum sync duration (ms) */
  maxSyncDuration: number;

  /** Maximum error rate */
  maxErrorRate: number;

  /** Maximum queue size */
  maxQueueSize: number;

  /** Maximum memory usage (MB) */
  maxMemoryUsage: number;

  /** Minimum cache hit rate */
  minCacheHitRate: number;
}

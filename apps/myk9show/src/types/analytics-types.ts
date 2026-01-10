/**
 * Analytics Types for Sync Monitoring
 * 
 * Defines TypeScript interfaces for sync analytics, metrics, and monitoring data
 * used throughout the sync monitoring dashboard and analytics service.
 */

// Core sync event types
export type SyncEventType =
  | 'sync_started'
  | 'sync_completed'
  | 'sync_failed'
  | 'conflict_detected'
  | 'conflict_resolved'
  | 'offline_mode_entered'
  | 'offline_mode_exited'
  | 'network_error'
  | 'bandwidth_threshold_exceeded';

// Conflict types for tracking different conflict scenarios
export type ConflictType =
  | 'update_update'
  | 'delete_update'
  | 'create_create'
  | 'schema_mismatch'
  | 'timestamp_conflict'
  | 'permission_conflict';

// Resolution strategy for conflicts
export type ConflictResolutionStrategy =
  | 'auto_merge'
  | 'last_write_wins'
  | 'manual_resolution'
  | 'field_level_merge'
  | 'timestamp_based'
  | 'user_preference'
  | 'server-authoritative'
  | 'client-authoritative'
  | 'last-write-wins'; // Shared convention

// Sync operation status
export type SyncStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'conflict_resolution_required'
  | 'synced' // Replication consistency
  | 'error'
  | 'conflict';

// Network connection status
export type NetworkStatus =
  | 'online'
  | 'offline'
  | 'limited'
  | 'slow'
  | 'unstable';

/**
 * Individual sync event record
 */
export interface SyncEvent {
  id: string;
  type: SyncEventType;
  timestamp: Date;
  duration?: number; // milliseconds
  status: SyncStatus;
  collectionName?: string;
  recordCount?: number;
  bytesTransferred?: number;
  errorMessage?: string;
  conflictType?: ConflictType;
  resolutionStrategy?: ConflictResolutionStrategy;
  metadata?: Record<string, unknown>;
}

/**
 * Conflict resolution details
 */
export interface ConflictResolution {
  conflictId: string;
  type: ConflictType;
  strategy: ConflictResolutionStrategy;
  resolvedAt: Date;
  resolvedBy?: string; // user ID or 'system'
  originalValue: unknown;
  resolvedValue: unknown;
  fieldPath: string;
  recordId: string;
  collectionName: string;
}

/**
 * Network performance metrics
 */
export interface NetworkMetrics {
  latency: number; // milliseconds
  bandwidth: number; // bytes per second
  packetLoss: number; // percentage
  connectionType: string;
  isOnline: boolean;
  lastOnlineAt?: Date;
  totalOfflineTime: number; // milliseconds
}

/**
 * Collection-specific sync metrics
 */
export interface CollectionSyncMetrics {
  collectionName: string;
  totalRecords: number;
  syncedRecords: number;
  pendingRecords: number;
  conflictedRecords: number;
  lastSyncAt?: Date;
  averageSyncTime: number; // milliseconds
  successRate: number; // percentage
  errorCount: number;
}

/**
 * Comprehensive sync metrics aggregation
 */
export interface SyncMetrics {
  // Time range for these metrics
  startTime: Date;
  endTime: Date;

  // Overall health and performance
  syncHealthScore: number; // 0-100 percentage
  successRate: number; // percentage of successful syncs
  averageSyncTime: number; // average time per sync in seconds

  // Sync operation counts
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;

  // Conflict metrics
  totalConflicts: number;
  resolvedConflicts: number;
  pendingConflicts: number;
  conflictRate: number; // conflicts per sync percentage

  // Network and performance
  bandwidthUsed: number; // total bytes
  compressionRatio: number; // compression efficiency (0-1)
  averageLatency: number; // milliseconds

  // Offline usage
  offlineUsageTime: number; // total minutes offline
  offlineSyncsQueued: number;

  // Collection breakdown
  collectionMetrics: CollectionSyncMetrics[];

  // Recent events for trend analysis
  recentEvents: SyncEvent[];

  // Performance trends (last 24 data points)
  syncTimeTrend: Array<{ timestamp: Date; value: number }>;
  successRateTrend: Array<{ timestamp: Date; value: number }>;
  conflictRateTrend: Array<{ timestamp: Date; value: number }>;
  bandwidthTrend: Array<{ timestamp: Date; value: number }>;
}

/**
 * Analytics configuration
 */
export interface AnalyticsConfig {
  // Retention periods
  detailedMetricsRetention: number; // days
  aggregatedMetricsRetention: number; // days

  // Sampling rates
  eventSamplingRate: number; // 0-1
  metricsSamplingRate: number; // 0-1

  // Alert thresholds
  healthScoreThreshold: number; // below this triggers alert
  successRateThreshold: number; // below this triggers alert
  conflictRateThreshold: number; // above this triggers alert
  syncTimeThreshold: number; // above this triggers alert (seconds)

  // Performance targets
  targetSyncTime: number; // target sync time in seconds
  targetSuccessRate: number; // target success rate percentage
  targetConflictRate: number; // target conflict rate percentage
}

/**
 * Alert configuration and status
 */
export interface SyncAlert {
  id: string;
  type: 'performance' | 'health' | 'conflict' | 'network' | 'storage';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  triggeredAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Performance benchmark data
 */
export interface PerformanceBenchmark {
  operation: string;
  targetTime: number; // milliseconds
  actualTime: number; // milliseconds
  recordCount: number;
  timestamp: Date;
  performanceRatio: number; // actual/target
}

/**
 * Storage usage metrics
 */
export interface StorageMetrics {
  totalUsed: number; // bytes
  totalAvailable: number; // bytes
  usageByCollection: Record<string, number>; // bytes per collection
  cacheSize: number; // bytes
  indexSize: number; // bytes
  lastCleanupAt?: Date;
}

/**
 * User behavior analytics for sync patterns
 */
export interface UserSyncBehavior {
  userId: string;
  avgSessionDuration: number; // minutes
  syncFrequency: number; // syncs per day
  offlineUsagePattern: number; // percentage of time offline
  mostActiveCollections: string[];
  conflictResolutionPreference: ConflictResolutionStrategy[];
}

/**
 * System resource usage during sync operations
 */
export interface ResourceUsage {
  timestamp: Date;
  cpuUsage: number; // percentage
  memoryUsage: number; // bytes
  diskIO: number; // operations per second
  networkIO: number; // bytes per second
  activeConnections: number;
}

/**
 * Export types for analytics data export
 */
export interface AnalyticsExport {
  exportId: string;
  format: 'json' | 'csv' | 'pdf';
  timeRange: {
    start: Date;
    end: Date;
  };
  includedMetrics: string[];
  generatedAt: Date;
  fileSize: number; // bytes
  downloadUrl?: string;
}

/**
 * Real-time dashboard state
 */
export interface DashboardState {
  isConnected: boolean;
  lastUpdateAt: Date;
  refreshInterval: number; // milliseconds
  selectedTimeRange: '1h' | '24h' | '7d' | '30d';
  activeTab: string;
  alertsCount: number;
  autoRefreshEnabled: boolean;
}

/**
 * Sync queue status and metrics
 */
export interface SyncQueueMetrics {
  queueLength: number;
  processingRate: number; // operations per minute
  averageWaitTime: number; // milliseconds
  priorityOperations: number;
  retryOperations: number;
  failedOperations: number;
  lastProcessedAt?: Date;
}

/**
 * Health check result for monitoring dashboard
 */
export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number; // milliseconds
  lastChecked: Date;
  details?: Record<string, unknown>;
  uptime: number; // percentage
}
/**
 * Performance optimization types for selective sync and bandwidth management
 *
 * This barrel file re-exports all performance types from domain-specific modules.
 * Import from here for backward compatibility, or import directly from sub-modules.
 */

// Sync configuration types (selective sync, scope, filters, priority, field-level sync)
export {
  type SelectiveSync,
  type SyncScope,
  type EntitySyncConfig,
  type SyncFilter,
  type TimeRangeFilter,
  type UserScopeFilter,
  type LocationScopeFilter,
  SyncPriority,
  type FieldLevelSyncConfig,
  type FieldSyncRule,
  type FieldSyncCondition,
  type PriorityQueueConfig,
  type PriorityRule,
  type PriorityModifier,
  type StarvationPreventionConfig,
} from './performance-sync-types';

// Delta synchronization types (diff config, delta operations, conflicts)
export {
  type DifferentialSyncConfig,
  type DiffCacheConfig,
  type DeltaAlgorithm,
  type DeltaCompressionType,
  type DeltaOperation,
  type DeltaPayload,
  type DeltaValidationResult,
  type SyncConflict,
  type ConflictResolutionStrategy,
  type DifferentialSyncMetrics,
} from './performance-delta-types';

// Compression types (config, options, results, metrics)
export {
  type CompressionConfig,
  type CompressionAlgorithm,
  type CompressionOptions,
  type CompressionResult,
  type CompressionMetrics,
} from './performance-compression-types';

// Performance metrics and monitoring types
export {
  type PerformanceMetrics,
  type SyncMetrics,
  type NetworkMetrics,
  type StorageMetrics,
  type ProcessingMetrics,
  type ErrorMetrics,
  type ErrorInfo,
  type PerformanceMonitoringConfig,
  type PerformanceThresholds,
} from './performance-metrics-types';

// Batch processing types (operations, queue, results, strategies)
export {
  type BatchProcessingConfig,
  type BatchRetryConfig,
  SyncStatus,
  type SyncOperation,
  type BatchConfig,
  type BatchQueueItem,
  type BatchResult,
  type BatchMetrics,
  type ProcessingStrategy,
  type RetryConfig,
  type BatchProcessingOptions,
} from './performance-batch-types';

// Aggregated settings type
export type { PerformanceOptimizationSettings } from './performance-settings-types';

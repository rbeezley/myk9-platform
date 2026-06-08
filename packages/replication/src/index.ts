/**
 * @myk9/replication
 *
 * Offline-first replication system for the myK9 Platform.
 *
 * This package provides:
 * - Core types for replication (ReplicatedRow, SyncMetadata, PendingMutation, etc.)
 * - Constants for timing and configuration
 * - Base classes for implementing replicated tables
 * - Database and cache management
 */

// Types
export type {
  ReplicatedRow,
  SyncStatus,
  SyncMetadata,
  PendingMutation,
  MutationOperation,
  MutationStatus,
  SyncResult,
  SyncOperation,
  SyncOptions,
  PerformanceReport,
  SyncProgress,
  SyncFailure,
  Conflict,
  ResolutionContext,
  ConflictStrategy,
  ConflictResolutionResult,
  FieldAuthority,
  TableFilter,
  QueryOptions,
  CacheStats,
} from './types';

// Conflict Resolution
export { ConflictResolver, conflictResolver } from './conflict/ConflictResolver';
export { ConflictManager, conflictManager } from './conflict/ConflictManager';
export type { ConflictEvent, ConflictEventType, ConflictStats } from './conflict/ConflictManager';
export {
  detectDirtyRowConflict,
  type DirtyRowConflictInput,
  type DirtyRowConflictResult,
} from './conflict/detectDirtyRowConflict';

// Dependency injection interfaces
export type {
  Logger,
  DiagnosticReport,
  GetTableTTL,
  LogDiagnostics,
  HandleDatabaseCorruption,
  ReplicatedTableDependencies,
  DatabaseManagerDependencies,
} from './dependencies';

export {
  noopLogger,
  defaultGetTableTTL,
  noopDiagnostics,
  noopCorruptionHandler,
} from './dependencies';

// Constants
export {
  // Database
  DB_NAME,
  DB_VERSION,
  TOTAL_REPLICATED_TABLES,
  // TTL
  DEFAULT_TTL_MS,
  SHOW_TTL_MS,
  TRIAL_TTL_MS,
  ENTRY_TTL_MS,
  RESULT_TTL_MS,
  // Query Performance
  QUERY_TIMEOUT_MS,
  SLOW_QUERY_THRESHOLD_MS,
  // Batch Operations
  DEFAULT_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  // Sync Engine
  SYNC_INTERVAL_MS,
  SYNC_BACKOFF_MULTIPLIER,
  MAX_SYNC_BACKOFF_MS,
  INITIAL_SYNC_BACKOFF_MS,
  MAX_SYNC_RETRIES,
  // Conflict Resolution
  TIMESTAMP_PRECISION_TOLERANCE_MS,
  MAX_CONFLICT_AGE_MS,
  // Prefetch
  PREFETCH_FRESH_WINDOW_MS,
  PREFETCH_START_DELAY_MS,
  PREFETCH_BATCH_INTERVAL_MS,
  // Debouncing
  NOTIFY_DEBOUNCE_MS,
  DIRTY_ROW_DEBOUNCE_MS,
  // Initialization
  TABLE_INIT_QUEUE_DELAY_MS,
  DB_INIT_TIMEOUT_MS,
  INIT_RETRY_DELAY_MS,
  GET_ALL_TIMEOUT_MS,
  DELETE_DB_TIMEOUT_MS,
  CIRCUIT_BREAKER_THRESHOLD,
  // Replication Manager
  SUBSCRIPTION_HEALTH_CHECK_INTERVAL_MS,
  SUBSCRIPTION_INIT_TIMEOUT_MS,
  MAX_CONCURRENT_SUBSCRIPTIONS,
  // Optimistic Updates
  MAX_OPTIMISTIC_UPDATE_RETRIES,
  OPTIMISTIC_UPDATE_BACKOFF_BASE_MS,
  // Transaction
  MAX_TRANSACTION_DURATION_MS,
  TRANSACTION_ABORT_DELAY_MS,
} from './constants';

// Core classes
export {
  DatabaseManager,
  databaseManager,
  REPLICATION_STORES,
  trackTransaction,
  getActiveTransactionCount,
  waitForActiveTransactions,
} from './core/DatabaseManager';

export { ReplicatedTableCacheManager } from './core/ReplicatedTableCache';
export { ReplicatedTableBatchManager } from './core/ReplicatedTableBatch';
export { ReplicatedTable } from './core/ReplicatedTable';
export { syncReplicatedTable } from './syncReplicatedTable';
export type {
  RemoteFetchContext,
  SyncReplicatedTableAdapter,
  SyncReplicatedTableOptions,
  SyncScope,
} from './syncReplicatedTable';

// Mutation utilities
export {
  TimeoutError,
  withTimeout,
  calculateBackoffDelay,
  backoffDelay,
  isRetryableError,
  TIMEOUT_PRESETS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_BACKOFF_BASE_MS,
  MAX_BACKOFF_MS,
  BACKOFF_JITTER,
} from './mutation-utils';

// MutationManager
export { MutationManager } from './MutationManager';
export type { MutationManagerOptions } from './MutationManager';

// Perf instrumentation
export { markPerf, measurePerf } from './perf';

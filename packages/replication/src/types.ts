/**
 * Type definitions for Full Table Replication System
 *
 * Core interfaces for replication infrastructure:
 * - ReplicatedRow: Wrapper for cached table rows
 * - SyncMetadata: Sync state tracking per table
 * - PendingMutation: Offline mutation queue
 * - SyncResult: Result of sync operations
 */

/**
 * Generic replicated row wrapper
 * Wraps any table row with replication metadata
 */
export interface ReplicatedRow<T> {
  tableName: string;        // e.g., 'entries', 'classes'
  id: string;               // Primary key value
  data: T;                  // Actual row data
  version: number;          // For conflict detection (increments on update)
  lastSyncedAt: number;     // Timestamp of last successful sync
  lastAccessedAt: number;   // For LRU eviction
  accessCount?: number;     // For LFU eviction (access frequency)
  lastModifiedAt?: number;  // Protect recently edited data
  isDirty: boolean;         // Has local changes not yet synced
  syncStatus: SyncStatus;
}

/**
 * Sync status for a row
 */
export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'error';

/**
 * Sync metadata per table
 */
export interface SyncMetadata {
  tableName: string;
  lastFullSyncAt: number;
  lastIncrementalSyncAt: number;
  totalRows?: number;           // Total rows cached
  syncStatus?: 'idle' | 'syncing' | 'error';
  errorMessage?: string;
  conflictCount?: number;
  pendingMutations?: number;
}

/**
 * Pending mutation queue item
 */
export interface PendingMutation {
  id: string;               // UUID for mutation
  tableName: string;
  operation: MutationOperation;
  rowId: string;            // ID of affected row
  data: Record<string, unknown>;  // Mutation data (generic object)
  timestamp: number;        // When mutation was queued
  retries: number;          // Retry attempts
  status: MutationStatus;
  error?: string;           // Last error message

  /** Causal dependency tracking */
  dependsOn?: string[];     // IDs of mutations that must complete before this one
  sequenceNumber?: number;  // Global sequence for ordering

  /** Earliest timestamp at which this mutation should be retried (backoff support) */
  nextRetryAt?: number;
}

/**
 * Mutation operation types
 */
export type MutationOperation = 'INSERT' | 'UPDATE' | 'DELETE' | 'BATCH_UPDATE';

/**
 * Mutation processing status
 */
export type MutationStatus = 'pending' | 'syncing' | 'failed' | 'success';

/**
 * Sync result returned from sync operations
 */
export interface SyncResult {
  tableName: string;
  success: boolean;
  operation: SyncOperation;
  rowsAffected: number;     // Rows inserted/updated/deleted
  conflictsResolved?: number;
  duration: number;         // Milliseconds
  error?: string;           // Error message if failed
}

/**
 * Sync operation types
 */
export type SyncOperation = 'full-sync' | 'incremental-sync' | 'INSERT' | 'UPDATE' | 'DELETE' | 'BATCH_UPDATE';

/**
 * Sync options for controlling sync behavior
 */
export interface SyncOptions {
  /** Force full sync even if incremental would be used */
  forceFullSync?: boolean;
  /** Skip uploading local mutations first */
  skipMutationUpload?: boolean;
  /** Priority level for this sync */
  priority?: 'critical' | 'high' | 'medium' | 'low';
  /** License key for multi-tenant filtering */
  licenseKey?: string;
}

/**
 * Performance report for replication system
 */
export interface PerformanceReport {
  cacheHitRate: string;           // e.g., "95.2%"
  avgSyncDuration: string;        // e.g., "234ms"
  conflictsResolved: number;
  mutationSuccessRate: number;    // 0-100
  storageUsedMB: string;          // e.g., "12.4"
  tablesReplicated: number;
}

/**
 * Sync progress event (for UI progress indicators)
 */
export interface SyncProgress {
  tableName: string;
  operation: 'full-sync' | 'incremental-sync' | 'upload-mutations';
  processed: number;        // Items processed so far
  total: number;            // Total items to process
  percentage: number;       // 0-100
  status?: 'synced' | 'syncing' | 'error';
}

/**
 * Sync failure notification (for error banner)
 */
export interface SyncFailure {
  count: number;
  mutations: PendingMutation[];
  message: string;
}

/**
 * Conflict resolution strategy
 */
export type ConflictStrategy =
  | 'last-write-wins'           // Compare timestamps
  | 'server-authoritative'      // Server always wins
  | 'client-authoritative'      // Client always wins
  | 'field-level-merge';        // Merge specific fields

/**
 * Result of a conflict resolution operation
 */
export interface ConflictResolutionResult<T> {
  resolvedEntity: T;
  strategy: ConflictStrategy;
  hadConflict: boolean;
  conflictingFields?: string[];
  automatic: boolean;
}

/**
 * Context for resolving a conflict
 */
export interface ResolutionContext {
  userId?: string;
  userRole?: string;
  userPermissions?: string[];
  timestamp: Date;
  deviceId?: string;
}

/**
 * Detailed conflict object for history and manual resolution
 */
export interface Conflict<T = any> {
  id: string;
  entityId: string;
  entityType?: string;
  localData: T;
  remoteData: T;
  baseData?: T;
  localTimestamp?: number;
  remoteTimestamp?: number;
  detectedAt: Date;
  status: 'pending' | 'resolved' | 'ignored';
  resolution?: {
    strategy: ConflictStrategy;
    resolvedEntity: T;
    resolvedAt: Date;
    resolvedBy?: string;
  };
}

/**
 * Strategy for field-level authority
 */
export interface FieldAuthority {
  /** Fields where server is authoritative (e.g., scores, placements) */
  serverFields: string[];

  /** Fields where client is authoritative (e.g., check-in status, UI state) */
  clientFields: string[];
}

/**
 * Table query filter
 */
export interface TableFilter<T = Record<string, unknown>> {
  field: keyof T;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'like';
  value: string | number | boolean | string[];
}

/**
 * Table query options
 */
export interface QueryOptions<T = Record<string, unknown>> {
  filters?: TableFilter<T>[];
  orderBy?: keyof T;
  orderDirection?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Cache statistics for a table
 */
export interface CacheStats {
  rowCount: number;
  sizeBytes: number;
  sizeMB: number;
  oldestAccess: number;
  newestAccess: number;
  dirtyCount: number;
}

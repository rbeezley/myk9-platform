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
  accessCount?: number;     // Day 25-26 LOW Fix: For LFU eviction (access frequency)
  lastModifiedAt?: number;  // Day 25-26 LOW Fix: Protect recently edited data
  isDirty: boolean;         // Has local changes not yet synced
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';
}

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
 *
 * Day 25-26: Added dependency tracking to prevent out-of-order execution
 */
export interface PendingMutation {
  id: string;               // UUID for mutation
  tableName: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'BATCH_UPDATE';
  rowId: string;            // ID of affected row
  data: Record<string, unknown>;  // Mutation data (generic object)
  timestamp: number;        // When mutation was queued
  retries: number;          // Retry attempts
  status: 'pending' | 'syncing' | 'failed' | 'success';
  error?: string;           // Last error message

  /** Day 25-26: Causal dependency tracking */
  dependsOn?: string[];     // IDs of mutations that must complete before this one
  sequenceNumber?: number;  // Global sequence for ordering (timestamp may not be unique)
}

/**
 * Sync result returned from sync operations
 */
export interface SyncResult {
  tableName: string;
  success: boolean;
  operation: 'full-sync' | 'incremental-sync' | 'INSERT' | 'UPDATE' | 'DELETE' | 'BATCH_UPDATE';
  rowsAffected: number;     // Rows inserted/updated/deleted
  conflictsResolved?: number;
  duration: number;         // Milliseconds
  error?: string;           // Error message if failed
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
 * Conflict resolution strategy enum
 */
export type ConflictStrategy =
  | 'last-write-wins'           // Compare timestamps
  | 'server-authoritative'      // Server always wins
  | 'client-authoritative'      // Client always wins
  | 'field-level-merge';        // Merge specific fields

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

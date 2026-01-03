/**
 * Synchronization and offline support type definitions
 */

// import { CompetitorScore } from './scoring-types';

// ============================================
// Sync Queue Types
// ============================================

/**
 * Queue for offline operations
 */
export interface SyncQueue {
  id: string;
  items: SyncQueueItem[];
  status: 'idle' | 'syncing' | 'error' | 'paused';
  lastSyncAttempt?: Date;
  nextSyncAttempt?: Date;
  retryCount: number;
  maxRetries: number;
}

/**
 * Individual item in sync queue
 */
export interface SyncQueueItem {
  id: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  priority: 'low' | 'normal' | 'high' | 'critical';
  createdAt: Date;
  attempts: number;
  lastAttempt?: Date;
  lastError?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  deviceId: string;
  userId: string;
}

/**
 * Type of sync operation
 */
export interface SyncOperation {
  type: OperationType;
  entity: EntityType;
  action: ActionType;
  timestamp: Date;
  version?: number;
}

/**
 * Operation types
 */
export type OperationType = 
  | 'create'
  | 'update'
  | 'delete'
  | 'batch';

/**
 * Entity types that can be synced
 */
export type EntityType = 
  | 'score'
  | 'entry'
  | 'placement'
  | 'note'
  | 'photo'
  | 'session';

/**
 * Action types
 */
export type ActionType = 
  | 'submit_score'
  | 'update_score'
  | 'delete_score'
  | 'mark_absent'
  | 'mark_excused'
  | 'disqualify'
  | 'add_note'
  | 'upload_photo'
  | 'calculate_placement';

// ============================================
// Conflict Resolution Types
// ============================================

/**
 * Conflict detected during sync
 */
export interface SyncConflict {
  id: string;
  type: ConflictType;
  entity: EntityType;
  entityId: string;
  localVersion: DataVersion;
  remoteVersion: DataVersion;
  detectedAt: Date;
  status: 'pending' | 'resolved' | 'ignored';
  resolution?: ConflictResolution;
}

/**
 * Types of conflicts
 */
export type ConflictType = 
  | 'version_mismatch'
  | 'duplicate_entry'
  | 'deleted_remotely'
  | 'modified_both'
  | 'constraint_violation';

/**
 * Data version for conflict detection
 */
export interface DataVersion {
  data: Record<string, unknown>;
  version: number;
  modifiedAt: Date;
  modifiedBy: string;
  deviceId?: string;
  checksum?: string;
}

/**
 * Conflict resolution
 */
export interface ConflictResolution {
  strategy: ResolutionStrategy;
  resolvedAt: Date;
  resolvedBy: string;
  result: Record<string, unknown>;
  notes?: string;
}

/**
 * Resolution strategies
 */
export type ResolutionStrategy = 
  | 'local_wins'      // Keep local version
  | 'remote_wins'     // Keep remote version
  | 'merge'           // Merge changes
  | 'manual'          // User decides
  | 'latest_wins'     // Most recent timestamp
  | 'highest_wins'    // Highest score (for scores)
  | 'judge_override'; // Judge's version wins

// ============================================
// Sync State Management Types
// ============================================

/**
 * Overall sync state
 */
export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  queue: SyncQueue;
  conflicts: SyncConflict[];
  lastSuccessfulSync?: Date;
  pendingOperations: number;
  failedOperations: number;
  statistics: SyncStatistics;
}

/**
 * Sync statistics
 */
export interface SyncStatistics {
  totalSynced: number;
  totalFailed: number;
  totalConflicts: number;
  averageSyncTime: number; // Milliseconds
  dataTransferred: number; // Bytes
  lastSyncDuration?: number;
  syncHistory: SyncHistoryEntry[];
}

/**
 * Sync history entry
 */
export interface SyncHistoryEntry {
  id: string;
  timestamp: Date;
  operation: string;
  success: boolean;
  itemCount: number;
  duration: number;
  errors?: string[];
}

// ============================================
// Network and Connection Types
// ============================================

/**
 * Network status
 */
export interface NetworkStatus {
  isConnected: boolean;
  type?: 'wifi' | 'cellular' | 'ethernet' | 'unknown';
  effectiveType?: '2g' | '3g' | '4g' | '5g';
  downlink?: number; // Mbps
  rtt?: number; // Round trip time in ms
  saveData?: boolean;
}

/**
 * Connection quality
 */
export interface ConnectionQuality {
  level: 'excellent' | 'good' | 'fair' | 'poor' | 'offline';
  latency: number;
  bandwidth: number;
  packetLoss: number;
  jitter: number;
  recommendation: ConnectionRecommendation;
}

/**
 * Connection recommendations
 */
export type ConnectionRecommendation = 
  | 'sync_now'           // Good connection, sync immediately
  | 'sync_when_better'   // Poor connection, wait
  | 'batch_sync'         // Batch operations for efficiency
  | 'offline_mode'       // Stay offline
  | 'retry_later';       // Temporary issue

// ============================================
// Sync Protocol Types
// ============================================

/**
 * Sync request to server
 */
export interface SyncRequest {
  deviceId: string;
  userId: string;
  lastSyncTimestamp?: Date;
  operations: SyncOperation[];
  checksum?: string;
  version: string; // App version
}

/**
 * Sync response from server
 */
export interface SyncResponse {
  success: boolean;
  timestamp: Date;
  processed: number;
  failed: number;
  conflicts: SyncConflict[];
  updates: DataUpdate[];
  nextSyncToken?: string;
  serverVersion: string;
}

/**
 * Data update from server
 */
export interface DataUpdate {
  entity: EntityType;
  entityId: string;
  operation: OperationType;
  data: Record<string, unknown>;
  version: number;
  timestamp: Date;
}

// ============================================
// Offline Storage Types
// ============================================

/**
 * Offline storage metadata
 */
export interface OfflineStorage {
  version: number;
  lastUpdated: Date;
  deviceId: string;
  userId: string;
  databases: OfflineDatabase[];
  totalSize: number; // Bytes
  quotaUsed: number; // Percentage
}

/**
 * Offline database info
 */
export interface OfflineDatabase {
  name: string;
  tables: OfflineTable[];
  size: number;
  recordCount: number;
  lastCompaction?: Date;
}

/**
 * Offline table info
 */
export interface OfflineTable {
  name: string;
  recordCount: number;
  pendingSync: number;
  lastModified: Date;
  indexes: string[];
}

// ============================================
// Sync Events Types
// ============================================

/**
 * Sync event for monitoring
 */
export interface SyncEvent {
  id: string;
  type: SyncEventType;
  timestamp: Date;
  details: Record<string, unknown>;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

/**
 * Types of sync events
 */
export type SyncEventType = 
  | 'sync_started'
  | 'sync_completed'
  | 'sync_failed'
  | 'conflict_detected'
  | 'conflict_resolved'
  | 'queue_full'
  | 'connection_lost'
  | 'connection_restored'
  | 'data_corrupted'
  | 'quota_exceeded';

// ============================================
// Export convenience types
// ============================================

export type Queue = SyncQueue;
export type QueueItem = SyncQueueItem;
export type Operation = SyncOperation;
export type Conflict = SyncConflict;
export type Resolution = ConflictResolution;
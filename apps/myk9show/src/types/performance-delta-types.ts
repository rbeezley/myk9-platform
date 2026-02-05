/**
 * Delta synchronization types for incremental sync operations
 * Phase 5.1.2: Delta Sync Configuration
 */

import type { PerformanceMetrics } from './performance-metrics-types';

/**
 * Configuration for differential sync algorithms
 * Optimizes bandwidth by only sending changes
 */
export interface DifferentialSyncConfig {
  /** Algorithm to use for diff calculation */
  algorithm: 'json-patch' | 'diff-match-patch' | 'custom';

  /** Minimum change size to trigger diff (bytes) */
  minChangeSize: number;

  /** Maximum patch size before sending full document (bytes) */
  maxPatchSize: number;

  /** Enable binary diff for attachments */
  binaryDiffEnabled: boolean;

  /** Checksum algorithm for change detection */
  checksumAlgorithm: 'md5' | 'sha1' | 'sha256' | 'xxhash';

  /** Cache configuration for diff calculations */
  cache?: DiffCacheConfig;
}

/**
 * Cache configuration for differential sync
 */
export interface DiffCacheConfig {
  /** Maximum number of cached diffs */
  maxEntries: number;

  /** TTL for cached diffs (ms) */
  ttl: number;

  /** Storage backend for cache */
  storage: 'memory' | 'indexeddb' | 'localstorage';
}

/**
 * Delta synchronization types for Phase 5.1.2
 */
export type DeltaAlgorithm = 'json-patch' | 'binary-diff' | 'custom';
export type DeltaCompressionType = 'none' | 'gzip' | 'brotli' | 'lz4';

/**
 * Delta operation for incremental sync
 */
export interface DeltaOperation {
  /** Operation type */
  type: 'add' | 'remove' | 'replace' | 'move' | 'copy';

  /** Path to the property being modified */
  path: string;

  /** New value for the property */
  value?: unknown;

  /** Previous value (for validation) */
  oldValue?: unknown;

  /** Source path for move/copy operations */
  from?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Delta payload containing operations and metadata
 */
export interface DeltaPayload {
  /** Unique identifier for this delta */
  id: string;

  /** Entity type being modified */
  entityType: string;

  /** Specific entity ID */
  entityId: string;

  /** List of operations to apply */
  operations: DeltaOperation[];

  /** Algorithm used to generate delta */
  algorithm: DeltaAlgorithm;

  /** Checksum of original data */
  originalChecksum?: string;

  /** Checksum of modified data */
  modifiedChecksum?: string;

  /** Timestamp when delta was created */
  timestamp: number;

  /** Compression type used */
  compressionType?: DeltaCompressionType;

  /** Compressed operations data */
  compressedData?: string;

  /** Compression ratio achieved */
  compressionRatio?: number;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of delta validation
 */
export interface DeltaValidationResult {
  /** Whether the delta is valid */
  isValid: boolean;

  /** List of validation errors */
  errors: string[];

  /** List of validation warnings */
  warnings: string[];
}

/**
 * Conflict information for concurrent modifications
 */
export interface SyncConflict {
  /** Unique identifier for the conflict */
  id: string;

  /** Entity type involved in conflict */
  entityType: string;

  /** Entity ID involved in conflict */
  entityId: string;

  /** Local version of the data */
  localVersion: unknown;

  /** Remote version of the data */
  remoteVersion: unknown;

  /** Base version for three-way merge */
  baseVersion?: unknown;

  /** Conflicting fields */
  conflictingFields: string[];

  /** Timestamp when conflict was detected */
  timestamp: number;

  /** Date when conflict was detected */
  detectedAt: Date;

  /** Current resolution status */
  status: 'pending' | 'resolved' | 'manual';

  /** Resolution strategy */
  resolution: 'pending' | 'manual' | 'last-write-wins' | 'first-write-wins' | 'merge';
}

/**
 * Strategy for resolving sync conflicts
 */
export type ConflictResolutionStrategy =
  | 'last-write-wins'
  | 'first-write-wins'
  | 'manual'
  | 'merge';

/**
 * Extended performance metrics for differential sync
 */
export interface DifferentialSyncMetrics extends PerformanceMetrics {
  /** Delta calculation performance */
  deltaCalculation: {
    averageTime: number;
    totalCalculations: number;
    compressionRatio: number;
  };

  /** Delta application performance */
  deltaApplication: {
    averageTime: number;
    totalApplications: number;
    successRate: number;
  };

  /** Conflict resolution metrics */
  conflictResolution: {
    totalConflicts: number;
    resolvedConflicts: number;
    manualResolutions: number;
  };
}

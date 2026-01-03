/**
 * Performance optimization types for selective sync and bandwidth management
 * Phase 5.1.1: Selective Sync Configuration
 */

/**
 * Configuration for selective sync operations
 * Controls which data is synchronized and how
 */
export interface SelectiveSync {
  /** Only sync data that has changed since last sync */
  syncOnlyChanged: boolean;
  
  /** Enable delta synchronization for bandwidth optimization */
  deltaSync: boolean;
  
  /** Enable compression for sync payloads */
  compressionEnabled: boolean;
  
  /** Number of records to sync in a single batch */
  batchSize: number;
  
  /** Scope configuration for selective data sync */
  scope?: SyncScope;
  
  /** Priority configuration for sync operations */
  priority?: SyncPriority;
}

/**
 * Scope configuration for selective sync
 * Defines which entities and fields to include in sync
 */
export interface SyncScope {
  /** Entities to include in sync */
  entities: EntitySyncConfig[];
  
  /** Time-based filtering */
  timeRange?: TimeRangeFilter;
  
  /** User-based filtering */
  userScope?: UserScopeFilter;
  
  /** Location-based filtering */
  locationScope?: LocationScopeFilter;
}

/**
 * Configuration for entity-level sync
 */
export interface EntitySyncConfig {
  /** Entity type (e.g., 'dogs', 'people', 'shows') */
  entityType: string;
  
  /** Fields to include in sync (null = all fields) */
  fields?: string[] | null;
  
  /** Filter conditions for this entity */
  filters?: SyncFilter[];
  
  /** Relationship depth to sync (0 = no relationships) */
  relationshipDepth?: number;
}

/**
 * Filter configuration for sync operations
 */
export interface SyncFilter {
  /** Field to filter on */
  field: string;
  
  /** Filter operator */
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
  
  /** Filter value */
  value: unknown;
}

/**
 * Time-based filtering for sync operations
 */
export interface TimeRangeFilter {
  /** Only sync records modified after this date */
  modifiedAfter?: Date;
  
  /** Only sync records modified before this date */
  modifiedBefore?: Date;
  
  /** Only sync records created after this date */
  createdAfter?: Date;
  
  /** Only sync records created before this date */
  createdBefore?: Date;
}

/**
 * User-based filtering for sync operations
 */
export interface UserScopeFilter {
  /** Only sync data for specific user IDs */
  userIds?: string[];
  
  /** Only sync data for specific roles */
  roles?: string[];
  
  /** Only sync data the current user has access to */
  currentUserOnly?: boolean;
}

/**
 * Location-based filtering for sync operations
 */
export interface LocationScopeFilter {
  /** Geographic regions to include */
  regions?: string[];
  
  /** Specific venue IDs to include */
  venueIds?: string[];
  
  /** Radius-based filtering */
  radius?: {
    center: { lat: number; lng: number };
    distanceKm: number;
  };
}

/**
 * Sync priority levels
 */
export enum SyncPriority {
  /** Critical data that must sync immediately */
  CRITICAL = 'critical',
  
  /** High priority data */
  HIGH = 'high',
  
  /** Normal priority data */
  NORMAL = 'normal',
  
  /** Low priority data that can sync when idle */
  LOW = 'low',
  
  /** Background sync only when on WiFi */
  BACKGROUND = 'background'
}

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
 * Configuration for data compression
 * Reduces bandwidth usage during sync
 */
export interface CompressionConfig {
  /** Compression algorithm to use */
  algorithm: 'gzip' | 'brotli' | 'lz4' | 'zstd';
  
  /** Compression level (1-9, higher = better compression, slower) */
  level: number;
  
  /** Minimum payload size to compress (bytes) */
  minSize: number;
  
  /** MIME types to compress */
  mimeTypes: string[];
  
  /** Enable streaming compression for large payloads */
  streamingEnabled: boolean;
  
  /** Dictionary for improved compression of domain-specific data */
  dictionary?: Uint8Array;
}

/**
 * Configuration for batch processing
 * Optimizes sync operations by grouping changes
 */
export interface BatchProcessingConfig {
  /** Maximum number of operations in a batch */
  maxBatchSize: number;
  
  /** Maximum time to wait before processing batch (ms) */
  maxWaitTime: number;
  
  /** Maximum payload size for a batch (bytes) */
  maxPayloadSize: number;
  
  /** Group operations by type for better performance */
  groupByOperation: boolean;
  
  /** Enable parallel processing of independent batches */
  parallelProcessing: boolean;
  
  /** Maximum number of parallel batches */
  maxParallelBatches: number;
  
  /** Retry configuration for failed batches */
  retry: BatchRetryConfig;
}

/**
 * Retry configuration for batch operations
 */
export interface BatchRetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  
  /** Initial delay between retries (ms) */
  initialDelay: number;
  
  /** Backoff multiplier for subsequent retries */
  backoffMultiplier: number;
  
  /** Maximum delay between retries (ms) */
  maxDelay: number;
  
  /** Retry only specific error types */
  retryableErrors?: string[];
}

/**
 * Configuration for field-level sync
 * Allows granular control over which fields are synchronized
 */
export interface FieldLevelSyncConfig {
  /** Default behavior for unlisted fields */
  defaultBehavior: 'include' | 'exclude';
  
  /** Field-specific sync rules */
  fieldRules: FieldSyncRule[];
  
  /** Enable automatic field detection based on usage */
  autoDetection: boolean;
  
  /** Track field access patterns for optimization */
  trackFieldUsage: boolean;
  
  /** Compress large text fields automatically */
  compressLargeFields: boolean;
  
  /** Threshold for large field compression (characters) */
  largeFieldThreshold: number;
}

/**
 * Sync rule for individual fields
 */
export interface FieldSyncRule {
  /** Entity type this rule applies to */
  entityType: string;
  
  /** Field path (supports nested fields with dot notation) */
  fieldPath: string;
  
  /** Sync behavior for this field */
  behavior: 'always' | 'never' | 'conditional' | 'lazy';
  
  /** Condition for conditional sync */
  condition?: FieldSyncCondition;
  
  /** Transform function for field value */
  transform?: 'compress' | 'encrypt' | 'hash' | 'truncate';
  
  /** Priority for this field */
  priority?: SyncPriority;
}

/**
 * Condition for field-level sync
 */
export interface FieldSyncCondition {
  /** Condition type */
  type: 'size' | 'age' | 'frequency' | 'device' | 'network';
  
  /** Condition parameters */
  params: Record<string, unknown>;
}

/**
 * Configuration for priority queue sync
 * Ensures important data syncs first
 */
export interface PriorityQueueConfig {
  /** Enable priority-based sync */
  enabled: boolean;
  
  /** Queue implementation */
  implementation: 'heap' | 'bucket' | 'weighted';
  
  /** Maximum queue size */
  maxQueueSize: number;
  
  /** Priority calculation rules */
  priorityRules: PriorityRule[];
  
  /** Enable dynamic priority adjustment */
  dynamicPriority: boolean;
  
  /** Starvation prevention for low priority items */
  starvationPrevention: StarvationPreventionConfig;
}

/**
 * Rule for calculating sync priority
 */
export interface PriorityRule {
  /** Rule identifier */
  id: string;
  
  /** Entity types this rule applies to */
  entityTypes: string[];
  
  /** Base priority for matching items */
  basePriority: number;
  
  /** Conditions that modify priority */
  modifiers: PriorityModifier[];
}

/**
 * Modifier for priority calculation
 */
export interface PriorityModifier {
  /** Condition for applying modifier */
  condition: string;
  
  /** Priority adjustment (+/- value) */
  adjustment: number;
  
  /** Whether this modifier can stack with others */
  stackable: boolean;
}

/**
 * Configuration for preventing starvation of low priority items
 */
export interface StarvationPreventionConfig {
  /** Enable starvation prevention */
  enabled: boolean;
  
  /** Maximum time an item can wait (ms) */
  maxWaitTime: number;
  
  /** Priority boost per time unit */
  priorityBoostRate: number;
  
  /** Maximum priority boost */
  maxBoost: number;
}

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
 * Performance optimization settings
 */
export interface PerformanceOptimizationSettings {
  /** Selective sync configuration */
  selectiveSync: SelectiveSync;
  
  /** Differential sync configuration */
  differentialSync: DifferentialSyncConfig;
  
  /** Compression configuration */
  compression: CompressionConfig;
  
  /** Batch processing configuration */
  batchProcessing: BatchProcessingConfig;
  
  /** Field-level sync configuration */
  fieldLevelSync: FieldLevelSyncConfig;
  
  /** Priority queue configuration */
  priorityQueue: PriorityQueueConfig;
  
  /** Performance monitoring settings */
  monitoring: PerformanceMonitoringConfig;
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

/**
 * Types for compression service implementation (Phase 5.1.3)
 */

/** Supported compression algorithms */
export type CompressionAlgorithm = 'gzip' | 'brotli' | 'lz4' | 'custom' | 'none';

/** Options for compression operations */
export interface CompressionOptions {
  /** Compression algorithm to use */
  algorithm?: CompressionAlgorithm;
  
  /** Compression level (1-9) */
  level?: number;
  
  /** Quality setting for algorithms that support it */
  quality?: number;
  
  /** Custom dictionary name to use */
  dictionary?: string;
  
  /** Enable streaming compression */
  streaming?: boolean;
}

/** Result of compression operation */
export interface CompressionResult {
  /** Compressed data */
  compressed: Uint8Array;
  
  /** Algorithm used */
  algorithm: CompressionAlgorithm;
  
  /** Original data size in bytes */
  originalSize: number;
  
  /** Compressed data size in bytes */
  compressedSize: number;
  
  /** Compression ratio (0-1, higher is better compression) */
  compressionRatio: number;
  
  /** Metadata for decompression */
  metadata: {
    algorithm: CompressionAlgorithm;
    version: string;
    dictionary?: string;
    error?: string;
  };
}

/** Performance metrics for compression operations */
export interface CompressionMetrics {
  /** Algorithm used */
  algorithm: CompressionAlgorithm;
  
  /** Original data size */
  originalSize: number;
  
  /** Compressed data size */
  compressedSize: number;
  
  /** Compression ratio achieved */
  compressionRatio: number;
  
  /** Time taken to compress (ms) */
  compressionTime: number;
  
  /** Timestamp of operation */
  timestamp: number;
}

/**
 * Types for batch processing implementation (Phase 5.1.4)
 */

/** Status of sync operations */
export enum SyncStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/** Sync operation interface */
export interface SyncOperation {
  /** Unique identifier for the operation */
  id: string;
  
  /** Type of entity being synced */
  entityType: string;
  
  /** Specific entity ID */
  entityId: string;
  
  /** Operation type */
  action: 'create' | 'update' | 'delete' | 'move';
  
  /** Data payload for the operation */
  data: unknown;
  
  /** Operation priority */
  priority: SyncPriority;
  
  /** Timestamp when operation was created */
  timestamp: Date;
  
  /** Current status of the operation */
  status: SyncStatus;
  
  /** Operation metadata */
  metadata?: {
    source?: string;
    version?: number;
    lastSync?: Date;
    isDelta?: boolean;
    originalSize?: number;
    deltaSize?: number;
    compressed?: boolean;
    compressionRatio?: number;
    [key: string]: unknown;
  };
}

/** Configuration for batch processing */
export interface BatchConfig {
  /** Maximum batch size */
  maxBatchSize: number;
  
  /** Minimum batch size */
  minBatchSize: number;
  
  /** Maximum parallel batches */
  maxParallelBatches: number;
  
  /** Batch timeout in milliseconds */
  batchTimeout: number;
  
  /** Enable adaptive batch sizing */
  adaptiveSizing: boolean;
  
  /** Enable priority-based queuing */
  priorityQueuing: boolean;
}

/** Queue item for batch processing */
export interface BatchQueueItem {
  /** Unique identifier */
  id: string;
  
  /** Operations in this batch */
  operations: SyncOperation[];
  
  /** Entity type for this batch */
  entityType: string;
  
  /** Batch priority */
  priority: SyncPriority;
  
  /** Current retry count */
  retryCount: number;
  
  /** When the batch was created */
  createdAt: Date;
  
  /** Size of the batch in bytes */
  size: number;
  
  /** Last error message if any */
  lastError?: string;
  
  /** When to retry next */
  nextRetryAt?: Date;
}

/** Result of batch processing */
export interface BatchResult {
  /** Batch identifier */
  batchId: string;
  
  /** Successfully processed operations */
  successful: Array<{
    operation: SyncOperation;
    result: unknown;
  }>;
  
  /** Failed operations */
  failed: Array<{
    operation: SyncOperation;
    error: Error;
    timestamp: Date;
  }>;
  
  /** Conflicts encountered */
  conflicts: SyncConflict[];
  
  /** Processing metrics */
  metrics: BatchMetrics;
}

/** Metrics for batch processing */
export interface BatchMetrics {
  /** Total operations in batch */
  totalOperations: number;
  
  /** Successfully processed count */
  successCount: number;
  
  /** Failed operation count */
  failureCount: number;
  
  /** Conflict count */
  conflictCount: number;
  
  /** Total processing time in ms */
  processingTime: number;
  
  /** Operations per second */
  throughput: number;
  
  /** Compression ratio achieved */
  compressionRatio: number;
  
  /** Number of retries */
  retryCount: number;
}

/** Processing strategy configuration */
export interface ProcessingStrategy {
  /** Strategy type */
  type: 'sequential' | 'parallel' | 'adaptive';
  
  /** Concurrency level for parallel processing */
  concurrency?: number;
  
  /** Adaptive parameters */
  adaptive?: {
    minConcurrency: number;
    maxConcurrency: number;
    adjustmentFactor: number;
  };
}

/** Retry configuration */
export interface RetryConfig {
  /** Maximum number of retries */
  maxRetries: number;
  
  /** Initial delay between retries (ms) */
  initialDelay: number;
  
  /** Maximum delay between retries (ms) */
  maxDelay: number;
  
  /** Backoff multiplier */
  backoffMultiplier: number;
  
  /** Errors that should trigger retry */
  retryableErrors?: string[];
}

/** Options for batch processing */
export interface BatchProcessingOptions {
  /** Processing strategy to use */
  strategy?: ProcessingStrategy;
  
  /** Custom retry configuration */
  retryConfig?: RetryConfig;
  
  /** Enable differential sync */
  enableDeltaSync?: boolean;
  
  /** Enable compression */
  enableCompression?: boolean;
  
  /** Performance thresholds */
  performanceThresholds?: {
    maxLatency: number;
    minThroughput: number;
    maxErrorRate: number;
  };
}
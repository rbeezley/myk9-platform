/**
 * Replication System Constants
 *
 * Centralized configuration for timing, limits, and thresholds
 * used throughout the replication system.
 */

// ==================== Database Configuration ====================

/** Database name for local IndexedDB storage */
export const DB_NAME = 'myK9Q_Replication';

/** Database schema version - v5 adds offline_queue store for consolidated IndexedDB */
export const DB_VERSION = 5;

/** Total number of tables managed by replication system */
export const TOTAL_REPLICATED_TABLES = 16;

// ==================== Time-to-Live (TTL) ====================

/** Default TTL for cached data (5 minutes in milliseconds) */
export const DEFAULT_TTL_MS = 300000; // 5 minutes

/** TTL for show data (30 days in milliseconds) */
export const SHOW_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** TTL for trial data (30 days in milliseconds) */
export const TRIAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** TTL for entry data (7 days in milliseconds) */
export const ENTRY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** TTL for result data (30 days in milliseconds) */
export const RESULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ==================== Query Performance ====================

/** Maximum query execution time before timeout (milliseconds) */
export const QUERY_TIMEOUT_MS = 500;

/** Threshold for slow query warning (milliseconds) */
export const SLOW_QUERY_THRESHOLD_MS = 100;

// ==================== Batch Operations ====================

/** Default chunk size for batch operations */
export const DEFAULT_CHUNK_SIZE = 50;

/** Maximum chunk size for batch operations */
export const MAX_CHUNK_SIZE = 100;

// ==================== Sync Engine ====================

/** Interval between sync attempts when online (milliseconds) */
export const SYNC_INTERVAL_MS = 60000; // 60 seconds (battery optimization)

/** Backoff multiplier for retry attempts */
export const SYNC_BACKOFF_MULTIPLIER = 2;

/** Maximum backoff time for sync retries (milliseconds) */
export const MAX_SYNC_BACKOFF_MS = 300000; // 5 minutes

/** Initial backoff delay for sync retries (milliseconds) */
export const INITIAL_SYNC_BACKOFF_MS = 1000; // 1 second

/** Maximum number of sync retry attempts */
export const MAX_SYNC_RETRIES = 3;

// ==================== Conflict Resolution ====================

/** Timestamp precision tolerance for conflict detection (milliseconds) */
export const TIMESTAMP_PRECISION_TOLERANCE_MS = 1000; // 1 second

/** Maximum age for conflict resolution preference (milliseconds) */
export const MAX_CONFLICT_AGE_MS = 86400000; // 24 hours

// ==================== Prefetch Manager ====================

/** Time window for considering data "fresh" (milliseconds) */
export const PREFETCH_FRESH_WINDOW_MS = 60000; // 1 minute

/** Delay before starting prefetch operations (milliseconds) */
export const PREFETCH_START_DELAY_MS = 2000; // 2 seconds

/** Interval between prefetch batches (milliseconds) */
export const PREFETCH_BATCH_INTERVAL_MS = 100; // 100ms between batches

// ==================== Debouncing & Throttling ====================

/** Debounce time for listener notifications (milliseconds) */
export const NOTIFY_DEBOUNCE_MS = 100;

/** Debounce time for dirty row tracking (milliseconds) */
export const DIRTY_ROW_DEBOUNCE_MS = 500;

// ==================== Initialization ====================

/** Delay between table initialization in queue (milliseconds) */
export const TABLE_INIT_QUEUE_DELAY_MS = 10;

/** Timeout for database initialization (milliseconds) */
export const DB_INIT_TIMEOUT_MS = 30000; // 30 seconds

/** Delay before retry after initialization failure (milliseconds) */
export const INIT_RETRY_DELAY_MS = 50;

// ==================== File Size Limits ====================

/** Maximum file size threshold for "large file" warning (lines) */
export const LARGE_FILE_THRESHOLD_LINES = 500;

/** Maximum function complexity before warning */
export const MAX_FUNCTION_COMPLEXITY = 10;

/** Maximum function length before warning (lines) */
export const MAX_FUNCTION_LINES = 50;

/** Maximum parameters per function before warning */
export const MAX_FUNCTION_PARAMS = 5;

/** Maximum nesting depth before warning */
export const MAX_NESTING_DEPTH = 4;

// ==================== Replication Manager ====================

/** Interval for checking subscription health (milliseconds) */
export const SUBSCRIPTION_HEALTH_CHECK_INTERVAL_MS = 60000; // 1 minute

/** Timeout for subscription initialization (milliseconds) */
export const SUBSCRIPTION_INIT_TIMEOUT_MS = 10000; // 10 seconds

/** Maximum number of concurrent subscription operations */
export const MAX_CONCURRENT_SUBSCRIPTIONS = 5;

// ==================== Optimistic Updates ====================

/** Maximum retries for optimistic update conflicts */
export const MAX_OPTIMISTIC_UPDATE_RETRIES = 3;

/** Exponential backoff base for optimistic update retries (milliseconds) */
export const OPTIMISTIC_UPDATE_BACKOFF_BASE_MS = 50;

// ==================== IndexedDB Transaction ====================

/** Maximum transaction duration before warning (milliseconds) */
export const MAX_TRANSACTION_DURATION_MS = 5000; // 5 seconds

/** Delay before aborting stuck transaction (milliseconds) */
export const TRANSACTION_ABORT_DELAY_MS = 10000; // 10 seconds

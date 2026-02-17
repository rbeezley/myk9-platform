/**
 * Constants for DifferentialSyncService
 */

/** Cache time-to-live in milliseconds (5 minutes) */
export const CACHE_TTL = 5 * 60 * 1000;

/** Maximum allowed delta size in bytes (1MB) */
export const MAX_DELTA_SIZE = 1024 * 1024;

/** Cache cleanup interval in milliseconds (1 minute) */
export const CACHE_CLEANUP_INTERVAL = 60000;

/** Performance metrics retention period in milliseconds (1 hour) */
export const METRICS_RETENTION_MS = 60 * 60 * 1000;

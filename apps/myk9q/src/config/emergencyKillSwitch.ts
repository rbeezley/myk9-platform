/**
 * Emergency Kill Switch for Replication System
 * Day 27: Production rollout safety mechanism
 *
 * This file provides an emergency kill switch to instantly disable
 * the replication system if critical issues are detected in production.
 *
 * HOW TO USE IN EMERGENCY:
 * 1. Set `REPLICATION_ENABLED = false`
 * 2. Deploy immediately (hot reload will pick up change)
 * 3. System falls back to legacy direct Supabase queries
 * 4. No data loss (pending mutations preserved in IndexedDB)
 *
 * ROLLBACK STEPS:
 * 1. Set REPLICATION_ENABLED = false
 * 2. Investigate error logs
 * 3. Fix issue
 * 4. Test thoroughly
 * 5. Set REPLICATION_ENABLED = true
 */

/**
 * EMERGENCY KILL SWITCH
 *
 * Set to `false` to instantly disable replication system.
 * App will fall back to direct Supabase queries.
 */
export const REPLICATION_ENABLED = true;

/**
 * Table-specific kill switches
 * Can disable individual tables if specific table has issues
 */
export const TABLE_ENABLED = {
  entries: true,
  classes: true,
  trials: true,
  shows: true,
  class_requirements: true,
  show_result_visibility_defaults: true,
  trial_result_visibility_overrides: true,
  class_result_visibility_overrides: true,
  announcements: true,
  announcement_reads: true,
  push_notification_config: true,
  push_subscriptions: true,
  event_statistics: true,
  nationals_rankings: true,
};

/**
 * Feature-specific kill switches
 */
export const FEATURE_ENABLED = {
  /** Offline mutation queue */
  offlineMutations: true,

  /** Real-time sync (Supabase subscriptions) */
  realtimeSync: true,

  /** Cross-tab sync (BroadcastChannel) */
  crossTabSync: true,

  /** Intelligent prefetching */
  prefetch: true,

  /** Auto-sync on startup */
  autoSyncOnStartup: true,

  /** Auto-sync interval (periodic background sync) */
  autoSyncInterval: true,

  /** LRU/LFU cache eviction */
  cacheEviction: true,

  /** Performance monitoring */
  monitoring: true,
};

/**
 * Performance degradation thresholds
 * If exceeded, automatic alerts are triggered
 */
export const DEGRADATION_THRESHOLDS = {
  /** Max acceptable sync duration (ms) */
  maxSyncDuration: 30000, // 30 seconds

  /** Min acceptable success rate (%) */
  minSuccessRate: 90,

  /** Max acceptable pending mutations */
  maxPendingMutations: 1000,

  /** Max acceptable storage usage (%) */
  maxStorageUsage: 90,
};

/**
 * Check if replication is enabled globally
 */
export function isReplicationEnabled(): boolean {
  return REPLICATION_ENABLED;
}

/**
 * Check if specific table is enabled
 */
export function isTableEnabled(tableName: string): boolean {
  if (!REPLICATION_ENABLED) return false;
  return TABLE_ENABLED[tableName as keyof typeof TABLE_ENABLED] ?? false;
}

/**
 * Check if specific feature is enabled
 */
export function isFeatureEnabled(featureName: keyof typeof FEATURE_ENABLED): boolean {
  if (!REPLICATION_ENABLED) return false;
  return FEATURE_ENABLED[featureName] ?? false;
}

/**
 * Get degradation threshold for metric
 */
export function getDegradationThreshold(metric: keyof typeof DEGRADATION_THRESHOLDS): number {
  return DEGRADATION_THRESHOLDS[metric];
}

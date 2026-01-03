/**
 * Table Replication Configuration
 *
 * Defines cache TTL and sync priority for each replicated table.
 * NO FEATURE FLAGS - Direct replacement approach (development only, no existing users).
 *
 * Phase 1-2: Infrastructure (Days 1-10)
 * Phase 3: Core tables (Days 11-15) - entries, classes, trials, shows
 * Phase 4: Secondary tables (Days 16-20) - visibility, announcements, stats
 * Phase 5: Rollout & cleanup (Days 21-27)
 */

/**
 * Table names that can be replicated
 */
export type ReplicatedTableName =
  // Core tables (Phase 3 - Days 11-15)
  | 'entries'
  | 'classes'
  | 'trials'
  | 'shows'
  | 'class_requirements'

  // Visibility config (Phase 3 Day 15)
  | 'show_result_visibility_defaults'
  | 'trial_result_visibility_overrides'
  | 'class_result_visibility_overrides'

  // Announcements (Phase 4 Day 16)
  | 'announcements'
  | 'announcement_reads'

  // Push notifications (Phase 4 Day 17)
  | 'push_notification_config'
  | 'push_subscriptions'

  // Nationals (Phase 4 Day 19)
  | 'event_statistics'
  | 'nationals_rankings'

  // Cached views (Phase 4 Day 18, 20)
  | 'view_stats_summary'
  | 'view_audit_log';

/**
 * Table-specific replication configuration
 */
interface TableReplicationConfig {
  priority: 'critical' | 'high' | 'medium' | 'low'; // Sync priority
  ttl: number;                // Cache TTL in milliseconds
}

/**
 * Replication configuration per table
 * All tables are enabled by default (no feature flags)
 */
const tableConfig: Record<ReplicatedTableName, TableReplicationConfig> = {
  // Core tables - Critical for offline scoring
  entries: {
    priority: 'critical',
    ttl: 12 * 60 * 60 * 1000, // 12 hours (backstop for ancient data, auto-sync handles freshness)
  },
  classes: {
    priority: 'critical',
    ttl: 12 * 60 * 60 * 1000, // 12 hours
  },
  trials: {
    priority: 'critical',
    ttl: 12 * 60 * 60 * 1000, // 12 hours
  },
  shows: {
    priority: 'critical',
    ttl: 60 * 60 * 1000, // 1 hour (changes infrequently)
  },
  class_requirements: {
    priority: 'high',
    ttl: 24 * 60 * 60 * 1000, // 24 hours (static data)
  },

  // Visibility config - Admin features
  show_result_visibility_defaults: {
    priority: 'high',
    ttl: 24 * 60 * 60 * 1000,
  },
  trial_result_visibility_overrides: {
    priority: 'high',
    ttl: 24 * 60 * 60 * 1000,
  },
  class_result_visibility_overrides: {
    priority: 'high',
    ttl: 24 * 60 * 60 * 1000,
  },

  // Announcements - Real-time features
  announcements: {
    priority: 'high',
    ttl: 5 * 60 * 1000, // 5 minutes (changes frequently)
  },
  announcement_reads: {
    priority: 'medium',
    ttl: 60 * 60 * 1000, // 1 hour
  },

  // Push notifications
  push_notification_config: {
    priority: 'medium',
    ttl: 24 * 60 * 60 * 1000,
  },
  push_subscriptions: {
    priority: 'medium',
    ttl: 24 * 60 * 60 * 1000,
  },

  // Nationals (dormant)
  event_statistics: {
    priority: 'low',
    ttl: 60 * 60 * 1000,
  },
  nationals_rankings: {
    priority: 'low',
    ttl: 60 * 60 * 1000,
  },

  // Cached views
  view_stats_summary: {
    priority: 'low',
    ttl: 60 * 60 * 1000, // 1 hour
  },
  view_audit_log: {
    priority: 'low',
    ttl: 60 * 60 * 1000,
  },
};

/**
 * Get TTL for a specific table
 */
export function getTableTTL(tableName: ReplicatedTableName): number {
  return tableConfig[tableName]?.ttl || 30 * 60 * 1000;
}

/**
 * Get sync priority for a specific table
 */
export function getTablePriority(tableName: ReplicatedTableName): string {
  return tableConfig[tableName]?.priority || 'medium';
}

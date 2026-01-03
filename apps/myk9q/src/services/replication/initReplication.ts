/**
 * Replication System Initialization
 *
 * Initializes the ReplicationManager and registers all tables.
 * Called from app startup (main.tsx or App.tsx).
 *
 * **Phase 4 Day 16** - UI Integration
 */

import {
  initReplicationManager,
  getReplicationManager,
  replicatedEntriesTable,
  replicatedClassesTable,
  replicatedTrialsTable,
  replicatedShowsTable,
  replicatedClassRequirementsTable,
  replicatedShowVisibilityDefaultsTable,
  replicatedTrialVisibilityOverridesTable,
  replicatedClassVisibilityOverridesTable,
  replicatedAnnouncementsTable,
  replicatedAnnouncementReadsTable,
  replicatedPushSubscriptionsTable,
  // NOTE: replicatedPushNotificationConfigTable removed - table contains secrets
  // that are only accessible via service_role (see Migration 028)
  replicatedStatsViewTable,
  replicatedEventStatisticsTable,
  replicatedNationalsRankingsTable,
  replicatedAuditLogViewTable,
} from './index';
import { cleanupDuplicateRecords } from './DatabaseManager';
import { isReplicationEnabled, clearDevelopmentDisableFlags } from './replicationConfig';
import { logger } from '@/utils/logger';

// Track if we've already initialized to prevent duplicate initialization
let isInitialized = false;

/**
 * Reset initialization state (call on logout)
 * Allows replication to reinitialize with a new license key after show switch
 */
export function resetReplicationState(): void {
  isInitialized = false;
  logger.log('[Replication] State reset - ready for new show initialization');
}

/**
 * Initialize the replication system
 * Should be called once at app startup
 * Subsequent calls will be ignored to prevent duplicate initialization
 */
export async function initializeReplication(): Promise<void> {
  try {
    // In development mode, auto-clear any disabled flags from HMR/reload false positives
    clearDevelopmentDisableFlags();

    // Check if replication is enabled
    if (!isReplicationEnabled()) {
      logger.warn('[Replication] Replication is disabled, skipping initialization');
      return;
    }

    // Check if we already have a manager instance
    const existingManager = getReplicationManager();
    if (existingManager) {
      logger.log('[Replication] Manager already exists, skipping duplicate initialization');
      return;
    }

    // Prevent duplicate initialization within same session
    if (isInitialized) {
      logger.log('[Replication] Already initialized in this session, checking manager state...');
      // Double-check that manager really exists
      const manager = getReplicationManager();
      if (!manager) {
        logger.warn('[Replication] isInitialized was true but manager is null, resetting flag');
        isInitialized = false; // Reset flag to allow reinitialization
      } else {
        return;
      }
    }

    // Get license key from auth
    const auth = JSON.parse(localStorage.getItem('myK9Q_auth') || '{}');
    const licenseKey = auth.showContext?.licenseKey;

    if (!licenseKey) {
      logger.log('[Replication] No license key found, skipping initialization');
      return;
    }

    logger.log('[Replication] Initializing replication system...');
    isInitialized = true; // Mark as initialized

    // Initialize ReplicationManager with configuration
    // Issue #4 Fix: Disable auto-sync during table registration to prevent race conditions
    // Note: autoSyncOnStartup is true but won't fire until startAutoSync() is called
    // after subscriptions are ready (line 159)
    const manager = initReplicationManager({
      licenseKey,
      autoSyncInterval: 5 * 60 * 1000, // 5 minutes
      autoSyncOnStartup: true, // Sync immediately when startAutoSync() is called
      autoSyncOnReconnect: true,
    });

    // Clean up duplicate records caused by numeric/string ID mismatch
    // This is a one-time migration fix - records with numeric IDs will be
    // converted to string IDs to prevent duplicates
    try {
      const cleanupResult = await cleanupDuplicateRecords();
      if (cleanupResult.cleaned > 0) {
        logger.log(`[Replication] Cleaned up ${cleanupResult.cleaned} duplicate records`);
      }
    } catch (cleanupError) {
      logger.warn('[Replication] Duplicate cleanup failed (non-fatal):', cleanupError);
      // Non-fatal - continue with initialization
    }

    // Register all tables
    logger.log('[Replication] Registering tables...');

    // Core tables
    manager.registerTable('entries', replicatedEntriesTable);
    manager.registerTable('classes', replicatedClassesTable);
    manager.registerTable('trials', replicatedTrialsTable);
    manager.registerTable('shows', replicatedShowsTable);
    manager.registerTable('class_requirements', replicatedClassRequirementsTable);

    // Visibility config tables
    manager.registerTable('show_result_visibility_defaults', replicatedShowVisibilityDefaultsTable);
    manager.registerTable('trial_result_visibility_overrides', replicatedTrialVisibilityOverridesTable);
    manager.registerTable('class_result_visibility_overrides', replicatedClassVisibilityOverridesTable);

    // Announcements & Push Notifications (Day 16-17)
    manager.registerTable('announcements', replicatedAnnouncementsTable);
    manager.registerTable('announcement_reads', replicatedAnnouncementReadsTable);
    manager.registerTable('push_subscriptions', replicatedPushSubscriptionsTable);
    // NOTE: push_notification_config is NOT registered for client-side replication
    // because it contains secrets (trigger_secret, anon_key) protected by RLS
    // that only allows service_role access. The browser client uses anon key.

    // Statistics Views (Day 18)
    manager.registerTable('view_stats_summary', replicatedStatsViewTable);

    // Nationals Tables (Day 19 - Dormant)
    manager.registerTable('event_statistics', replicatedEventStatisticsTable);
    manager.registerTable('nationals_rankings', replicatedNationalsRankingsTable);

    // Audit Log View (Day 20)
    manager.registerTable('view_audit_log', replicatedAuditLogViewTable);

    logger.log('[Replication] Registered 15 tables');

    // Issue #4 Fix: Wait for all subscriptions to be ready before starting sync
    logger.log('[Replication] Waiting for subscriptions to initialize...');
    await manager.waitForSubscriptionsReady();
    logger.log('[Replication] All subscriptions ready');

    // Now start auto-sync (all tables registered and subscriptions ready)
    logger.log('[Replication] Starting auto-sync...');
    manager.startAutoSync();

    logger.log('[Replication] ✅ Replication system initialized successfully');
  } catch (error) {
    logger.error('[Replication] Failed to initialize replication system:', error);
    // Don't throw - app should work without replication
  }
}

/**
 * Trigger a manual sync for a specific table
 * Useful for pull-to-refresh functionality
 */
export async function triggerManualSync(tableName: string): Promise<void> {
  const manager = getReplicationManager();
  if (!manager) {
    logger.warn('[Replication] Cannot sync - manager not initialized');
    return;
  }

  try {
    logger.log(`[Replication] Manual sync triggered for ${tableName}`);
    const result = await manager.syncTable(tableName);

    if (result.success) {
      logger.log(`[Replication] ✅ Manual sync complete: ${result.rowsAffected} rows`);
    } else {
      logger.error(`[Replication] ❌ Manual sync failed: ${result.error}`);
    }
  } catch (error) {
    logger.error(`[Replication] Manual sync error for ${tableName}:`, error);
  }
}

/**
 * Trigger a full sync (all tables)
 * Useful for initial data load
 */
export async function triggerFullSync(licenseKey: string): Promise<void> {
  const manager = getReplicationManager();
  if (!manager) {
    logger.warn('[Replication] Cannot sync - manager not initialized');
    return;
  }

  try {
    logger.log('[Replication] Full sync triggered for all tables');
    const results = await manager.syncAll({ licenseKey, forceFullSync: true });

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    logger.log(`[Replication] ✅ Full sync complete: ${successful} succeeded, ${failed} failed`);
  } catch (error) {
    logger.error('[Replication] Full sync error:', error);
  }
}

/**
 * Clear all caches (call when switching shows)
 * Prevents multi-tenant data leakage
 */
export async function clearReplicationCaches(): Promise<void> {
  const manager = getReplicationManager();
  if (!manager) {
    logger.warn('[Replication] Cannot clear caches - manager not initialized');
    return;
  }

  try {
    logger.log('[Replication] Clearing all caches for show change...');
    await manager.clearAllCaches();
    logger.log('[Replication] ✅ All caches cleared');
  } catch (error) {
    logger.error('[Replication] Failed to clear caches:', error);
  }
}

/**
 * Get performance report for monitoring
 */
export async function getReplicationPerformance() {
  const manager = getReplicationManager();
  if (!manager) {
    return null;
  }

  return await manager.getPerformanceReport();
}

/**
 * Refresh a specific table (pull-to-refresh)
 * Forces a full sync to get the latest data from server
 */
export async function refreshTable(tableName: string): Promise<void> {
  const manager = getReplicationManager();
  if (!manager) {
    logger.warn('[Replication] Cannot refresh - manager not initialized');
    return;
  }

  try {
    logger.log(`[Replication] Refreshing table: ${tableName}`);
    const result = await manager.refreshTable(tableName);

    if (result.success) {
      logger.log(`[Replication] ✅ Refresh complete: ${result.rowsAffected} rows`);
    } else {
      logger.error(`[Replication] ❌ Refresh failed: ${result.error}`);
    }
  } catch (error) {
    logger.error(`[Replication] Refresh error for ${tableName}:`, error);
  }
}

/**
 * Refresh all tables (pull-to-refresh)
 * Forces a full sync to get the latest data from server
 */
export async function refreshAllTables(): Promise<void> {
  const manager = getReplicationManager();
  if (!manager) {
    logger.warn('[Replication] Cannot refresh - manager not initialized');
    return;
  }

  try {
    logger.log('[Replication] Refreshing all tables...');
    const results = await manager.refreshAll();

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    logger.log(`[Replication] ✅ Refresh complete: ${successful} succeeded, ${failed} failed`);
  } catch (error) {
    logger.error('[Replication] Refresh error:', error);
  }
}

/**
 * Re-export getReplicationManager for external use
 */
export { getReplicationManager };

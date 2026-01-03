/**
 * ReplicationManager - Central orchestrator for table replication
 *
 * DEBT-004 Refactored: Extracted responsibilities into focused modules:
 * - ConnectionManager: Real-time subscriptions, cross-tab sync, network events
 * - SyncOrchestrator: Sync coordination, queue management, quota/LRU eviction
 *
 * This file remains the facade/registry providing:
 * - Table registration and lookup
 * - Public API for application code
 * - Cache update listener management
 * - Prefetch integration
 * - Performance reporting
 *
 * **Phase 2 Day 10** - Orchestration and coordination
 */

import { SyncEngine } from './SyncEngine';
import { PrefetchManager } from './PrefetchManager';
import { ConnectionManager, type ConnectionManagerConfig } from './ConnectionManager';
import { SyncOrchestrator, type SyncOrchestratorConfig, type CacheStatsResult } from './SyncOrchestrator';
import type { ReplicatedTable } from './ReplicatedTable';
import type { SyncResult, PerformanceReport } from './types';
import type { SyncOptions } from './SyncEngine';
import type { ReplicatedTableName } from '@/config/featureFlags';
import { logger } from '@/utils/logger';

/** Type guard to check if a table has a cleanup method */
function hasCleanup(table: ReplicatedTable<{ id: string }>): table is ReplicatedTable<{ id: string }> & { cleanup: () => Promise<void> } {
  return typeof (table as unknown as { cleanup?: () => Promise<void> }).cleanup === 'function';
}

export interface ReplicationManagerConfig {
  /** Auto-sync interval in milliseconds (default: 5 min) */
  autoSyncInterval?: number;

  /** License key for multi-tenant filtering */
  licenseKey: string;

  /** Enable automatic sync on app startup */
  autoSyncOnStartup?: boolean;

  /** Enable automatic sync on network reconnect */
  autoSyncOnReconnect?: boolean;

  /** Batch size for bulk operations */
  batchSize?: number;

  /** Enable automatic quota management (default: true) */
  autoQuotaManagement?: boolean;

  /** Soft limit before eviction in MB (default: 4.5 = 90% of 5 MB target) */
  quotaSoftLimitMB?: number;

  /** Target size after eviction in MB (default: 5 MB = ~10 typical shows) */
  quotaTargetMB?: number;

  /** Day 25-26: Force full sync interval to detect server deletions (default: 24 hours) */
  forceFullSyncInterval?: number;

  /** Day 25-26 MEDIUM Fix: Enable real-time subscriptions for instant cache invalidation (default: true) */
  enableRealtimeSync?: boolean;

  /** Day 25-26 MEDIUM Fix: Enable cross-tab sync via BroadcastChannel (default: true) */
  enableCrossTabSync?: boolean;
}

export class ReplicationManager {
  private tables: Map<string, ReplicatedTable<any>> = new Map();

  /** Extracted modules (DEBT-004) */
  private connectionManager: ConnectionManager;
  private syncOrchestrator: SyncOrchestrator;
  private syncEngine: SyncEngine;
  private prefetchManager: PrefetchManager;

  /** Cache update listeners for UI notification */
  private cacheUpdateListeners: Map<string, Set<(tableName: string) => void>> = new Map();

  constructor(config: ReplicationManagerConfig) {
    // Initialize SyncEngine
    this.syncEngine = new SyncEngine({
      syncInterval: config.autoSyncInterval,
      autoSyncOnReconnect: config.autoSyncOnReconnect ?? true,
    });

    // Initialize ConnectionManager (DEBT-004)
    const connectionConfig: ConnectionManagerConfig = {
      licenseKey: config.licenseKey,
      enableRealtimeSync: config.enableRealtimeSync,
      enableCrossTabSync: config.enableCrossTabSync,
    };

    this.connectionManager = new ConnectionManager(
      connectionConfig,
      // Callback for sync when real-time changes are detected
      async (tableName: string, forceFullSync: boolean) => {
        await this.syncOrchestrator.syncTable(tableName, { forceFullSync });
      }
    );

    // Initialize SyncOrchestrator (DEBT-004)
    const syncConfig: SyncOrchestratorConfig = {
      licenseKey: config.licenseKey,
      autoSyncInterval: config.autoSyncInterval,
      autoSyncOnStartup: config.autoSyncOnStartup,
      autoSyncOnReconnect: config.autoSyncOnReconnect,
      batchSize: config.batchSize,
      autoQuotaManagement: config.autoQuotaManagement,
      quotaSoftLimitMB: config.quotaSoftLimitMB,
      quotaTargetMB: config.quotaTargetMB,
      forceFullSyncInterval: config.forceFullSyncInterval,
    };

    this.syncOrchestrator = new SyncOrchestrator(
      syncConfig,
      this.syncEngine,
      {
        // Callback for getting a table
        getTable: <T extends { id: string }>(tableName: string) => this.getTable<T>(tableName),
        // Callback for getting all table names
        getTableNames: () => this.getRegisteredTables(),
        // Callback for notifying cache updates
        notifyCacheUpdate: (tableName: string) => this.notifyCacheUpdated(tableName),
        // Callback for getting cache stats (avoids circular dependency)
        getCacheStats: () => this.getCacheStats()
      }
    );

    // Initialize ConnectionManager
    this.connectionManager.initialize();

    // Day 23-24: Initialize prefetch manager for intelligent prefetching
    this.prefetchManager = new PrefetchManager(this);

    // Listen for network events from ConnectionManager
    window.addEventListener('connection:network-online', this.handleNetworkOnline);
    window.addEventListener('connection:network-offline', this.handleNetworkOffline);

    logger.log('✅ [ReplicationManager] Initialized with extracted modules (DEBT-004)');
  }

  // ========================================
  // TABLE REGISTRATION
  // ========================================

  /**
   * Register a table for replication
   */
  registerTable<T extends { id: string }>(
    tableName: ReplicatedTableName,
    table: ReplicatedTable<T>
  ): void {
    if (this.tables.has(tableName)) {
      logger.warn(
        `[ReplicationManager] Table "${tableName}" already registered, skipping`
      );
      return;
    }

    this.tables.set(tableName, table);
    logger.log(`[ReplicationManager] Registered table: ${tableName}`);

    // Subscribe to real-time changes via ConnectionManager
    this.connectionManager.subscribeToTable(tableName);
  }

  /**
   * Unregister a table
   */
  unregisterTable(tableName: string): void {
    if (this.tables.delete(tableName)) {
      this.connectionManager.unsubscribeFromTable(tableName);
      logger.log(`[ReplicationManager] Unregistered table: ${tableName}`);
    }
  }

  /**
   * Get a registered table
   */
  getTable<T extends { id: string }>(
    tableName: string
  ): ReplicatedTable<T> | null {
    return (this.tables.get(tableName) as ReplicatedTable<T>) || null;
  }

  /**
   * Get all registered table names
   */
  getRegisteredTables(): string[] {
    return Array.from(this.tables.keys());
  }

  // ========================================
  // SYNC OPERATIONS (delegated to SyncOrchestrator)
  // ========================================

  /**
   * Check if sync is currently in progress
   */
  isSyncInProgress(): boolean {
    return this.syncOrchestrator.isSyncInProgress();
  }

  /**
   * Wait for all subscription setups to complete
   */
  async waitForSubscriptionsReady(): Promise<void> {
    await this.connectionManager.waitForSubscriptionsReady();
  }

  /**
   * Sync a single table
   */
  async syncTable(
    tableName: string,
    options?: Partial<SyncOptions>
  ): Promise<SyncResult> {
    return this.syncOrchestrator.syncTable(tableName, options);
  }

  /**
   * Sync all registered tables
   */
  async syncAll(options?: Partial<SyncOptions>): Promise<SyncResult[]> {
    return this.syncOrchestrator.syncAll(options);
  }

  /**
   * Force full sync for a single table
   */
  async fullSyncTable(
    tableName: string,
    options?: Partial<SyncOptions>
  ): Promise<SyncResult> {
    return this.syncOrchestrator.fullSyncTable(tableName, options);
  }

  /**
   * Force full sync for all tables
   */
  async fullSyncAll(options?: Partial<SyncOptions>): Promise<SyncResult[]> {
    return this.syncOrchestrator.fullSyncAll(options);
  }

  /**
   * Refresh a single table (alias for fullSyncTable for pull-to-refresh UIs)
   */
  async refreshTable(
    tableName: string,
    options?: Partial<SyncOptions>
  ): Promise<SyncResult> {
    return this.syncOrchestrator.refreshTable(tableName, options);
  }

  /**
   * Refresh all tables (alias for fullSyncAll for pull-to-refresh UIs)
   */
  async refreshAll(options?: Partial<SyncOptions>): Promise<SyncResult[]> {
    return this.syncOrchestrator.refreshAll(options);
  }

  // ========================================
  // AUTO-SYNC (delegated to SyncOrchestrator)
  // ========================================

  /**
   * Start automatic sync timer
   */
  startAutoSync(): void {
    this.syncOrchestrator.startAutoSync();
  }

  /**
   * Stop automatic sync timer
   */
  stopAutoSync(): void {
    this.syncOrchestrator.stopAutoSync();
  }

  // ========================================
  // CACHE OPERATIONS
  // ========================================

  /**
   * Clear all caches (e.g., when switching shows)
   * This prevents multi-tenant data leakage
   */
  async clearAllCaches(): Promise<void> {
    logger.log('[ReplicationManager] Clearing all caches...');

    // Clear all table caches
    const tableNames = Array.from(this.tables.keys());

    for (const tableName of tableNames) {
      const table = this.tables.get(tableName);
      if (table) {
        try {
          await table.clearCache();
          logger.log(`[ReplicationManager] Cleared cache for ${tableName}`);
        } catch (error) {
          logger.error(`[ReplicationManager] Failed to clear cache for ${tableName}:`, error);
        }
      }
    }

    // CRITICAL: Also clear pending mutations to prevent stale data uploads
    try {
      await this.syncEngine.clearAllMutations();
      logger.log('[ReplicationManager] ✅ Cleared pending mutations');
    } catch (error) {
      logger.error('[ReplicationManager] Failed to clear mutations:', error);
    }

    // v4: Clear prefetch cache (consolidated from legacy myK9Q database)
    try {
      const { prefetchCache } = await import('./PrefetchCacheManager');
      await prefetchCache.clear();
      logger.log('[ReplicationManager] ✅ Cleared prefetch cache');
    } catch (error) {
      logger.error('[ReplicationManager] Failed to clear prefetch cache:', error);
    }

    // v5: Clear offline queue (consolidated from legacy myK9Q.mutations)
    try {
      const { mutationQueue } = await import('./MutationQueueManager');
      await mutationQueue.clear();
      logger.log('[ReplicationManager] ✅ Cleared offline queue');
    } catch (error) {
      logger.error('[ReplicationManager] Failed to clear offline queue:', error);
    }

    logger.log('[ReplicationManager] ✅ All caches and mutations cleared');
  }

  /**
   * Run LRU eviction on all tables
   */
  async evictLRU(targetSizeMB: number = 50): Promise<number> {
    return this.syncOrchestrator.evictLRU(targetSizeMB);
  }

  /**
   * Get cache statistics across all tables
   */
  async getCacheStats(): Promise<CacheStatsResult> {
    const tableStats: CacheStatsResult['tableStats'] = [];

    let totalRows = 0;
    let totalSizeBytes = 0;

    for (const [tableName, table] of this.tables) {
      const stats = await table.getCacheStats();
      totalRows += stats.rowCount;
      totalSizeBytes += stats.sizeBytes;

      tableStats.push({
        tableName,
        rowCount: stats.rowCount,
        sizeMB: stats.sizeMB,
        sizeBytes: stats.sizeBytes,
        dirtyCount: stats.dirtyCount,
      });
    }

    return {
      totalRows,
      totalSizeMB: totalSizeBytes / 1024 / 1024,
      tableStats: tableStats.sort((a, b) => b.sizeMB - a.sizeMB),
    };
  }

  // ========================================
  // NETWORK & STATUS
  // ========================================

  /**
   * Check if network is online
   */
  isOnline(): boolean {
    return this.syncEngine.isNetworkOnline();
  }

  /**
   * Get sync history
   */
  getSyncHistory(limit: number = 10): SyncResult[] {
    return this.syncOrchestrator.getSyncHistory(limit);
  }

  /**
   * Get performance report
   */
  async getPerformanceReport(): Promise<PerformanceReport> {
    const recentSyncs = this.getSyncHistory(50);
    const successfulSyncs = recentSyncs.filter((r) => r.success);

    const avgSyncDuration =
      successfulSyncs.length > 0
        ? successfulSyncs.reduce((sum, r) => sum + r.duration, 0) /
          successfulSyncs.length
        : 0;

    const totalConflicts = successfulSyncs.reduce(
      (sum, r) => sum + (r.conflictsResolved || 0),
      0
    );

    const mutationSuccessRate =
      recentSyncs.length > 0
        ? (successfulSyncs.length / recentSyncs.length) * 100
        : 100;

    // Get storage estimate
    let storageUsedMB = '0';
    try {
      const estimate = await navigator.storage?.estimate();
      if (estimate?.usage) {
        storageUsedMB = (estimate.usage / (1024 * 1024)).toFixed(1);
      }
    } catch (error) {
      logger.error('Failed to get storage estimate:', error);
    }

    return {
      cacheHitRate: 'N/A', // Will be implemented when we add cache metrics
      avgSyncDuration: `${avgSyncDuration.toFixed(0)}ms`,
      conflictsResolved: totalConflicts,
      mutationSuccessRate: Math.round(mutationSuccessRate),
      storageUsedMB,
      tablesReplicated: this.tables.size,
    };
  }

  // ========================================
  // NETWORK EVENT HANDLERS
  // ========================================

  private handleNetworkOnline = async (): Promise<void> => {
    await this.syncOrchestrator.handleNetworkOnline();
  };

  private handleNetworkOffline = (): void => {
    this.syncOrchestrator.handleNetworkOffline();
  };

  // ========================================
  // PREFETCH
  // ========================================

  /**
   * Track page navigation for intelligent prefetching
   */
  trackNavigation(pagePath: string): void {
    this.prefetchManager.trackNavigation(pagePath);
  }

  /**
   * Get prefetch statistics
   */
  getPrefetchStats(): {
    totalPatterns: number;
    mostCommonTransition: string | null;
    currentPage: string;
  } {
    return this.prefetchManager.getStats();
  }

  /**
   * Manually trigger prefetch for a specific page
   */
  async prefetchForPage(pageName: string): Promise<void> {
    return this.prefetchManager.prefetchForPage(pageName);
  }

  // ========================================
  // CACHE UPDATE LISTENERS
  // ========================================

  /**
   * Subscribe to cache update notifications for UI refresh
   *
   * When the cache is updated (via sync), all registered listeners will be notified.
   * This allows UI components to refresh without maintaining separate real-time subscriptions.
   *
   * @param tableName - Table to listen for updates (e.g., 'entries', 'classes')
   * @param listener - Callback function invoked when cache is updated
   * @returns Unsubscribe function
   */
  onCacheUpdate(tableName: string, listener: (tableName: string) => void): () => void {
    if (!this.cacheUpdateListeners.has(tableName)) {
      this.cacheUpdateListeners.set(tableName, new Set());
    }

    const listeners = this.cacheUpdateListeners.get(tableName)!;
    listeners.add(listener);

    logger.log(`[ReplicationManager] Registered cache update listener for ${tableName} (${listeners.size} total)`);

    // Return unsubscribe function
    return () => this.offCacheUpdate(tableName, listener);
  }

  /**
   * Unsubscribe from cache update notifications
   */
  offCacheUpdate(tableName: string, listener: (tableName: string) => void): void {
    const listeners = this.cacheUpdateListeners.get(tableName);
    if (listeners) {
      listeners.delete(listener);
      logger.log(`[ReplicationManager] Removed cache update listener for ${tableName} (${listeners.size} remaining)`);

      // Clean up empty sets
      if (listeners.size === 0) {
        this.cacheUpdateListeners.delete(tableName);
      }
    }
  }

  /**
   * Notify all listeners that a table's cache has been updated
   */
  private notifyCacheUpdated(tableName: string): void {
    const listeners = this.cacheUpdateListeners.get(tableName);
    if (listeners && listeners.size > 0) {
      logger.log(`[ReplicationManager] Notifying ${listeners.size} listeners that ${tableName} cache was updated`);
      listeners.forEach(listener => {
        try {
          listener(tableName);
        } catch (error) {
          logger.error(`[ReplicationManager] Error in cache update listener for ${tableName}:`, error);
        }
      });
    }
  }

  // ========================================
  // LIFECYCLE
  // ========================================

  /**
   * Stop replication manager and cleanup resources
   */
  async stop(): Promise<void> {
    logger.log('[ReplicationManager] Stopping replication...');

    // Stop auto sync via orchestrator
    this.syncOrchestrator.destroy();

    // Cleanup tables (close DB connections)
    for (const [tableName, table] of this.tables) {
      try {
        // If table has a cleanup method, call it
        if (hasCleanup(table)) {
          await table.cleanup();
        }
      } catch (error) {
        logger.warn(`[ReplicationManager] Error cleaning up table ${tableName}:`, error);
      }
    }

    // Clear tables map
    this.tables.clear();

    logger.log('[ReplicationManager] Replication stopped');
  }

  /**
   * Cleanup all resources
   */
  destroy(): void {
    // Stop auto-sync and clear orchestrator state
    this.syncOrchestrator.destroy();

    // Remove network event listeners
    window.removeEventListener('connection:network-online', this.handleNetworkOnline);
    window.removeEventListener('connection:network-offline', this.handleNetworkOffline);

    // Clean up ConnectionManager
    this.connectionManager.destroy();

    // Clean up cache update listeners
    this.cacheUpdateListeners.clear();

    // Clean up SyncEngine
    this.syncEngine.destroy();

    // Clear tables
    this.tables.clear();

    logger.log('🗑️ [ReplicationManager] Destroyed');
  }
}

// ========================================
// SINGLETON MANAGEMENT
// ========================================

let instance: ReplicationManager | null = null;

export function initReplicationManager(
  config: ReplicationManagerConfig
): ReplicationManager {
  if (instance) {
    logger.warn('[ReplicationManager] Already initialized, returning existing instance');
    return instance;
  }

  instance = new ReplicationManager(config);
  return instance;
}

export function getReplicationManager(): ReplicationManager | null {
  return instance;
}

export function destroyReplicationManager(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}

export async function stopReplicationManager(): Promise<void> {
  if (instance) {
    await instance.stop();
  }
}

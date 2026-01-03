/**
 * SyncEngine - Orchestrates bidirectional sync between Supabase and IndexedDB
 *
 * Refactored as part of DEBT-005 to improve maintainability.
 * This is now a thin facade that delegates to focused modules:
 * - MutationManager: Handles offline mutation queue
 * - SyncExecutor: Handles sync operations (full/incremental)
 *
 * Responsibilities:
 * - Database initialization
 * - Network state monitoring
 * - Sync metadata management
 * - Coordination between modules
 *
 * **Phase 2 Day 6-7** - Core sync infrastructure
 */

import type { ReplicatedTable } from './ReplicatedTable';
import type { SyncMetadata, SyncResult, SyncProgress } from './types';
import { logger } from '@/utils/logger';
import { REPLICATION_STORES } from './ReplicatedTable';
import { openDB, type IDBPDatabase } from 'idb';
import { MutationManager, type MutationManagerConfig } from './MutationManager';
import { SyncExecutor, type SyncExecutorOptions } from './SyncExecutor';
import { DB_NAME, DB_VERSION } from './replicationConstants';

export interface SyncOptions {
  /** Force full sync even if incremental is available */
  forceFullSync?: boolean;

  /** License key for multi-tenant filtering */
  licenseKey: string;

  /** Batch size for bulk operations */
  batchSize?: number;

  /** Progress callback for UI updates */
  onProgress?: (progress: SyncProgress) => void;
}

export interface SyncEngineConfig {
  /** How often to run incremental sync (ms) */
  syncInterval?: number;

  /** Maximum retry attempts for failed mutations */
  maxRetries?: number;

  /** Exponential backoff base (ms) */
  retryBackoffBase?: number;

  /** Enable automatic sync on network reconnect */
  autoSyncOnReconnect?: boolean;
}

export class SyncEngine {
  private db: IDBPDatabase | null = null;
  private syncInterval: number;
  private autoSyncOnReconnect: boolean;
  private isOnline: boolean = navigator.onLine;
  private syncTimer: NodeJS.Timeout | null = null;
  private isSyncing: boolean = false;

  // Extracted modules (DEBT-005)
  private mutationManager: MutationManager;
  private syncExecutor: SyncExecutor;

  constructor(config: SyncEngineConfig = {}) {
    this.syncInterval = config.syncInterval || 5 * 60 * 1000; // 5 min default
    void this.syncInterval; // Reserved for future periodic sync feature
    this.autoSyncOnReconnect = config.autoSyncOnReconnect ?? true;

    // Initialize extracted modules with callbacks
    const mutationConfig: MutationManagerConfig = {
      maxRetries: config.maxRetries || 3,
      retryBackoffBase: config.retryBackoffBase || 1000,
    };

    this.mutationManager = new MutationManager(
      mutationConfig,
      () => this.init() // Provide database access via callback
    );

    this.syncExecutor = new SyncExecutor(
      (tableName) => this.getSyncMetadata(tableName),
      (tableName, updates) => this.updateSyncMetadata(tableName, updates)
    );

    // Listen for network changes
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  // ========================================
  // DATABASE INITIALIZATION
  // ========================================

  /**
   * Initialize IndexedDB connection
   */
  private async init(): Promise<IDBPDatabase> {
    if (this.db) return this.db;

    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db, _oldVersion, _newVersion, _transaction) {
        // Create replicated_tables store
        if (!db.objectStoreNames.contains(REPLICATION_STORES.REPLICATED_TABLES)) {
          const store = db.createObjectStore(REPLICATION_STORES.REPLICATED_TABLES, {
            keyPath: ['tableName', 'id'],
          });
          store.createIndex('tableName', 'tableName', { unique: false });
          store.createIndex('tableName_lastSyncedAt', ['tableName', 'lastSyncedAt'], {
            unique: false,
          });
          store.createIndex('isDirty', 'isDirty', { unique: false });
        }

        // Create sync_metadata store
        if (!db.objectStoreNames.contains(REPLICATION_STORES.SYNC_METADATA)) {
          db.createObjectStore(REPLICATION_STORES.SYNC_METADATA, {
            keyPath: 'tableName',
          });
        }

        // Create pending_mutations store
        if (!db.objectStoreNames.contains(REPLICATION_STORES.PENDING_MUTATIONS)) {
          const mutationStore = db.createObjectStore(
            REPLICATION_STORES.PENDING_MUTATIONS,
            {
              keyPath: 'id',
            }
          );
          mutationStore.createIndex('status', 'status', { unique: false });
          mutationStore.createIndex('tableName', 'tableName', { unique: false });
        }
      },
    });
    return this.db;
  }

  // ========================================
  // SYNC OPERATIONS (Delegated to SyncExecutor)
  // ========================================

  /**
   * Full sync: Download all data for a table
   * Delegates to SyncExecutor
   */
  async fullSync(
    table: ReplicatedTable<any>,
    options: SyncOptions
  ): Promise<SyncResult> {
    const executorOptions: SyncExecutorOptions = {
      forceFullSync: options.forceFullSync,
      licenseKey: options.licenseKey,
      batchSize: options.batchSize,
      onProgress: options.onProgress,
    };

    return this.syncExecutor.fullSync(table, executorOptions);
  }

  /**
   * Incremental sync: Download only changed data since last sync
   * Delegates to SyncExecutor
   */
  async incrementalSync(
    table: ReplicatedTable<any>,
    options: SyncOptions
  ): Promise<SyncResult> {
    const executorOptions: SyncExecutorOptions = {
      forceFullSync: options.forceFullSync,
      licenseKey: options.licenseKey,
      batchSize: options.batchSize,
      onProgress: options.onProgress,
    };

    return this.syncExecutor.incrementalSync(table, executorOptions);
  }

  // ========================================
  // MUTATION UPLOAD (Delegated to MutationManager)
  // ========================================

  /**
   * Upload pending mutations (offline changes) to server
   * Delegates to MutationManager
   */
  async uploadPendingMutations(): Promise<SyncResult[]> {
    return this.mutationManager.uploadPendingMutations();
  }

  /**
   * Clear all pending mutations (call on logout/show switch)
   * Prevents stale mutations from previous shows being uploaded
   * Delegates to MutationManager
   */
  async clearAllMutations(): Promise<void> {
    return this.mutationManager.clearAllMutations();
  }

  // ========================================
  // SYNC METADATA
  // ========================================

  /**
   * Get sync metadata for a table
   */
  private async getSyncMetadata(tableName: string): Promise<SyncMetadata | null> {
    try {
      const db = await this.init();
      const metadata = await db.get(REPLICATION_STORES.SYNC_METADATA, tableName);
      return metadata || null;
    } catch (error) {
      logger.error(`Failed to get sync metadata for ${tableName}:`, error);
      return null;
    }
  }

  /**
   * Update sync metadata for a table
   */
  private async updateSyncMetadata(
    tableName: string,
    updates: Partial<SyncMetadata>
  ): Promise<void> {
    try {
      const db = await this.init();
      const existing = await this.getSyncMetadata(tableName);

      const metadata: SyncMetadata = {
        tableName,
        lastFullSyncAt: existing?.lastFullSyncAt || 0,
        lastIncrementalSyncAt: existing?.lastIncrementalSyncAt || 0,
        totalRows: existing?.totalRows || 0,
        ...updates,
      };

      await db.put(REPLICATION_STORES.SYNC_METADATA, metadata);
    } catch (error) {
      logger.error(`Failed to update sync metadata for ${tableName}:`, error);
    }
  }

  // ========================================
  // NETWORK STATE MANAGEMENT
  // ========================================

  /**
   * Handle online event
   */
  private handleOnline = async (): Promise<void> => {
    this.isOnline = true;
    logger.log('🌐 [SyncEngine] Network online');

    // Restore mutations from localStorage if needed
    await this.mutationManager.restoreMutationsFromLocalStorage();

    if (this.autoSyncOnReconnect && !this.isSyncing) {
      logger.log('🔄 [SyncEngine] Auto-syncing after reconnect...');
      // Note: This requires ReplicationManager to be implemented
      // For now, we just log and dispatch an event
      window.dispatchEvent(new CustomEvent('replication:network-online'));
    }
  };

  /**
   * Handle offline event
   */
  private handleOffline = (): void => {
    this.isOnline = false;
    logger.log('📴 [SyncEngine] Network offline');
    window.dispatchEvent(new CustomEvent('replication:network-offline'));
  };

  /**
   * Check if online
   */
  isNetworkOnline(): boolean {
    return this.isOnline;
  }

  // ========================================
  // CLEANUP
  // ========================================

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);

    // Cleanup extracted modules
    this.mutationManager.destroy();

    if (this.db) {
      this.db.close();
      this.db = null;
    }

    logger.log('🗑️ [SyncEngine] Destroyed');
  }
}

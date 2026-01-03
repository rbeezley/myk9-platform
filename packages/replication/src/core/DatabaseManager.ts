/**
 * DatabaseManager - Shared IndexedDB Connection Management
 *
 * Responsibilities:
 * - Singleton database instance management
 * - Connection initialization with timeout protection
 * - Transaction queue to prevent stampede during multi-table init
 * - Corruption detection and recovery
 * - Race condition prevention
 */

import { openDB, deleteDB, IDBPDatabase } from 'idb';
import type { Logger, DatabaseManagerDependencies, LogDiagnostics, HandleDatabaseCorruption } from '../dependencies';
import { noopLogger, noopDiagnostics, noopCorruptionHandler } from '../dependencies';
import {
  DB_NAME,
  DB_VERSION,
  DB_INIT_TIMEOUT_MS,
  INIT_RETRY_DELAY_MS,
} from '../constants';

/**
 * Object store names for the replication system
 */
export const REPLICATION_STORES = {
  REPLICATED_TABLES: 'replicated_tables',
  SYNC_METADATA: 'sync_metadata',
  PENDING_MUTATIONS: 'pending_mutations',
  PREFETCH_CACHE: 'prefetch_cache',
  OFFLINE_QUEUE: 'offline_queue',
} as const;

/**
 * Database state - singleton pattern
 * CRITICAL: All ReplicatedTable instances MUST share the same DB connection
 * to avoid upgrade transaction deadlocks when multiple tables initialize simultaneously
 */
let sharedDB: IDBPDatabase | null = null;
let dbInitPromise: Promise<IDBPDatabase> | null = null;

/**
 * Table initialization queue to prevent transaction stampede
 */
let tableInitQueue: Promise<void> = Promise.resolve();
let tablesInitialized = 0;

/**
 * Atomic flag to prevent race condition in dbInitPromise assignment
 */
let dbInitInProgress = false;

/**
 * Transaction tracking to prevent stampede
 */
const activeTransactions = new Set<Promise<void>>();

/**
 * Track an active transaction for stampede prevention
 * Called by ReplicatedTable.runTransaction()
 */
export function trackTransaction(txPromise: Promise<void>): void {
  activeTransactions.add(txPromise);
  txPromise.finally(() => {
    activeTransactions.delete(txPromise);
  });
}

/**
 * Get the count of active transactions (for diagnostics)
 */
export function getActiveTransactionCount(): number {
  return activeTransactions.size;
}

/**
 * Wait for all active transactions to complete
 */
export async function waitForActiveTransactions(): Promise<void> {
  if (activeTransactions.size > 0) {
    await Promise.all(Array.from(activeTransactions));
  }
}

/**
 * Create the IndexedDB object stores during upgrade
 */
function createObjectStores(
  db: IDBPDatabase,
  oldVersion: number,
  transaction: IDBTransaction,
  logger: Logger
): void {
  // Create replicated_tables store if it doesn't exist
  if (!db.objectStoreNames.contains(REPLICATION_STORES.REPLICATED_TABLES)) {
    logger.log(`[DatabaseManager] Creating REPLICATED_TABLES store...`);

    const store = db.createObjectStore(REPLICATION_STORES.REPLICATED_TABLES, {
      keyPath: ['tableName', 'id'],
    });
    store.createIndex('tableName', 'tableName', { unique: false });
    store.createIndex('tableName_lastSyncedAt', ['tableName', 'lastSyncedAt'], { unique: false });
    store.createIndex('isDirty', 'isDirty', { unique: false });

    // Performance indexes for hot query paths
    store.createIndex('tableName_data.class_id', ['tableName', 'data.class_id'], { unique: false });
    store.createIndex('tableName_data.trial_id', ['tableName', 'data.trial_id'], { unique: false });
    store.createIndex('tableName_data.show_id', ['tableName', 'data.show_id'], { unique: false });
    store.createIndex('tableName_data.armband_number', ['tableName', 'data.armband_number'], { unique: false });
  } else if (oldVersion < 3) {
    // Upgrade from v1/v2 to v3: Add query performance indexes if missing
    const store = transaction.objectStore(REPLICATION_STORES.REPLICATED_TABLES);

    if (!store.indexNames.contains('tableName_data.class_id')) {
      store.createIndex('tableName_data.class_id', ['tableName', 'data.class_id'], { unique: false });
    }
    if (!store.indexNames.contains('tableName_data.trial_id')) {
      store.createIndex('tableName_data.trial_id', ['tableName', 'data.trial_id'], { unique: false });
    }
    if (!store.indexNames.contains('tableName_data.show_id')) {
      store.createIndex('tableName_data.show_id', ['tableName', 'data.show_id'], { unique: false });
    }
    if (!store.indexNames.contains('tableName_data.armband_number')) {
      store.createIndex('tableName_data.armband_number', ['tableName', 'data.armband_number'], { unique: false });
    }
  }

  // Create sync_metadata store
  if (!db.objectStoreNames.contains(REPLICATION_STORES.SYNC_METADATA)) {
    logger.log(`[DatabaseManager] Creating SYNC_METADATA store...`);
    db.createObjectStore(REPLICATION_STORES.SYNC_METADATA, {
      keyPath: 'tableName',
    });
  }

  // Create pending_mutations store
  if (!db.objectStoreNames.contains(REPLICATION_STORES.PENDING_MUTATIONS)) {
    logger.log(`[DatabaseManager] Creating PENDING_MUTATIONS store...`);
    const mutationStore = db.createObjectStore(REPLICATION_STORES.PENDING_MUTATIONS, {
      keyPath: 'id',
    });
    mutationStore.createIndex('status', 'status', { unique: false });
    mutationStore.createIndex('tableName', 'tableName', { unique: false });
  }

  // Create prefetch_cache store
  if (!db.objectStoreNames.contains(REPLICATION_STORES.PREFETCH_CACHE)) {
    logger.log(`[DatabaseManager] Creating PREFETCH_CACHE store...`);
    const prefetchStore = db.createObjectStore(REPLICATION_STORES.PREFETCH_CACHE, {
      keyPath: 'key',
    });
    prefetchStore.createIndex('timestamp', 'timestamp', { unique: false });
    prefetchStore.createIndex('ttl', 'ttl', { unique: false });
  }

  // Create offline_queue store
  if (!db.objectStoreNames.contains(REPLICATION_STORES.OFFLINE_QUEUE)) {
    logger.log(`[DatabaseManager] Creating OFFLINE_QUEUE store...`);
    const offlineQueueStore = db.createObjectStore(REPLICATION_STORES.OFFLINE_QUEUE, {
      keyPath: 'id',
    });
    offlineQueueStore.createIndex('status', 'status', { unique: false });
    offlineQueueStore.createIndex('timestamp', 'timestamp', { unique: false });
    offlineQueueStore.createIndex('type', 'type', { unique: false });
  }

  logger.log(`[DatabaseManager] Upgrade callback complete`);
}

/**
 * DatabaseManager class - manages shared IndexedDB connection
 */
export class DatabaseManager {
  private logger: Logger;
  private logDiagnostics: LogDiagnostics;
  private handleCorruption: HandleDatabaseCorruption;
  private dbName: string;
  private dbVersion: number;

  constructor(dependencies: DatabaseManagerDependencies = {}, dbName?: string, dbVersion?: number) {
    this.logger = dependencies.logger ?? noopLogger;
    this.logDiagnostics = dependencies.logDiagnostics ?? noopDiagnostics;
    this.handleCorruption = dependencies.handleDatabaseCorruption ?? noopCorruptionHandler;
    this.dbName = dbName ?? DB_NAME;
    this.dbVersion = dbVersion ?? DB_VERSION;
  }

  /**
   * Open the database with timeout protection
   */
  private async openDatabaseWithTimeout(): Promise<IDBPDatabase> {
    this.logger.log(`[DatabaseManager] About to call openDB("${this.dbName}", ${this.dbVersion})...`);

    const openDBPromise = openDB(this.dbName, this.dbVersion, {
      upgrade: (db, oldVersion, newVersion, transaction) => {
        this.logger.log(`[DatabaseManager] Upgrade callback triggered - oldVersion: ${oldVersion}, newVersion: ${newVersion}`);
        createObjectStores(db, oldVersion, transaction as unknown as IDBTransaction, this.logger);
      },
    }).then((db) => {
      this.logger.log(`[DatabaseManager] openDB() promise resolved!`);
      return db;
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Database open timed out after ${DB_INIT_TIMEOUT_MS}ms - database may be corrupted or locked`));
      }, DB_INIT_TIMEOUT_MS);
    });

    return Promise.race([openDBPromise, timeoutPromise]);
  }

  /**
   * Handle database corruption - delete and recreate
   */
  private async recoverFromCorruption(): Promise<IDBPDatabase> {
    this.logger.warn(`[DatabaseManager] Deleting corrupted database and attempting recovery...`);
    this.handleCorruption();

    await deleteDB(this.dbName);
    this.logger.log(`[DatabaseManager] Database deleted successfully`);

    const retryPromise = openDB(this.dbName, this.dbVersion, {
      upgrade: (db, oldVersion, newVersion, transaction) => {
        this.logger.log(`[DatabaseManager] Retry upgrade - oldVersion: ${oldVersion}, newVersion: ${newVersion}`);
        createObjectStores(db, oldVersion, transaction as unknown as IDBTransaction, this.logger);
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Database open timed out after ${DB_INIT_TIMEOUT_MS}ms on retry`));
      }, DB_INIT_TIMEOUT_MS);
    });

    return Promise.race([retryPromise, timeoutPromise]);
  }

  /**
   * Get the shared database instance
   * SINGLETON PATTERN: All tables share the same DB instance to prevent upgrade deadlocks
   */
  async getDatabase(tableName: string): Promise<IDBPDatabase> {
    this.logger.log(`[${tableName}] init() called - sharedDB: ${!!sharedDB}, dbInitPromise: ${!!dbInitPromise}`);

    // Return shared instance if already initialized AND connection is healthy
    if (sharedDB) {
      try {
        const storeNames = sharedDB.objectStoreNames;
        if (!storeNames.contains(REPLICATION_STORES.REPLICATED_TABLES)) {
          throw new Error('Object stores missing - database may have been recreated');
        }

        // Try to start a transaction to detect "closing" state
        sharedDB.transaction(REPLICATION_STORES.SYNC_METADATA, 'readonly');

        this.logger.log(`[${tableName}] Using existing sharedDB (health check passed)`);
        return sharedDB;
      } catch (healthCheckError) {
        const errorMsg = healthCheckError instanceof Error ? healthCheckError.message : String(healthCheckError);

        if (errorMsg.includes('closing')) {
          this.logger.warn(`[${tableName}] Database connection is closing, reinitializing...`);
        } else {
          this.logger.warn(`[${tableName}] Database health check failed, reinitializing...`, healthCheckError);
        }

        if (sharedDB) {
          try {
            sharedDB.close();
          } catch {
            // Ignore close errors
          }
        }

        if (errorMsg.includes('Object stores missing') || errorMsg.includes('object stores was not found')) {
          this.logger.warn(`[${tableName}] Corrupted database detected - deleting and recreating...`);
          try {
            await deleteDB(this.dbName);
            this.logger.log(`[${tableName}] Corrupted database deleted successfully`);
          } catch (deleteError) {
            this.logger.error(`[${tableName}] Failed to delete corrupted database:`, deleteError);
          }
        }

        sharedDB = null;
        dbInitPromise = null;
        dbInitInProgress = false;
        tableInitQueue = Promise.resolve();
        tablesInitialized = 0;
      }
    }

    // If initialization is in progress, wait for it AND join the queue
    if (dbInitPromise) {
      this.logger.log(`[${tableName}] Waiting for dbInitPromise to resolve...`);

      const db = await dbInitPromise;
      this.logger.log(`[${tableName}] dbInitPromise resolved successfully`);

      const myTurn = tableInitQueue.then(async () => {
        tablesInitialized++;
        this.logger.log(`[${tableName}] My turn in queue (${tablesInitialized})`);

        if (activeTransactions.size > 0) {
          this.logger.log(`[${tableName}] Waiting for ${activeTransactions.size} active transactions to complete...`);
          await Promise.all(Array.from(activeTransactions));
          this.logger.log(`[${tableName}] All active transactions complete`);
        }

        this.logger.log(`[${tableName}] Queue slot complete, ready for transactions`);
      });

      tableInitQueue = myTurn;
      await myTurn;

      return db;
    }

    // Check if another thread is currently initializing
    if (dbInitInProgress) {
      this.logger.log(`[${tableName}] Another thread is initializing DB, waiting...`);
      await new Promise(resolve => setTimeout(resolve, INIT_RETRY_DELAY_MS));
      return this.getDatabase(tableName);
    }

    // We won the race - set flag atomically
    dbInitInProgress = true;
    this.logger.log(`[${tableName}] Won initialization race, creating database...`);

    try {
      dbInitPromise = this.openDatabaseWithTimeout();
      sharedDB = await dbInitPromise;

      this.logger.log(`[DatabaseManager] Shared database initialized successfully`);
      dbInitInProgress = false;

      return sharedDB;
    } catch (error) {
      this.logger.error(`[DatabaseManager] Failed to open database:`, error);

      try {
        sharedDB = await this.recoverFromCorruption();
        dbInitPromise = Promise.resolve(sharedDB);

        this.logger.log(`[DatabaseManager] Database recreated successfully after corruption`);
        dbInitInProgress = false;

        tableInitQueue = Promise.resolve();
        tablesInitialized = 0;

        return sharedDB;
      } catch (retryError) {
        this.logger.error(`[DatabaseManager] Failed to recreate database after deletion:`, retryError);

        setTimeout(() => {
          Promise.resolve(this.logDiagnostics({ error: retryError })).catch(err => {
            this.logger.error('[DatabaseManager] Diagnostic report failed:', err);
          });
        }, 0);

        const currentlyInUse = activeTransactions.size > 0;
        if (!currentlyInUse) {
          this.logger.log(`[${tableName}] No active transactions, safe to reset global state`);
          dbInitPromise = null;
          sharedDB = null;
          tableInitQueue = Promise.resolve();
          tablesInitialized = 0;
        }

        dbInitInProgress = false;
        throw retryError;
      }
    }
  }

  /**
   * Check if database is initialized
   */
  isInitialized(): boolean {
    return sharedDB !== null;
  }

  /**
   * Get initialization status for diagnostics
   */
  getStatus(): {
    isInitialized: boolean;
    initInProgress: boolean;
    tablesInitialized: number;
    activeTransactions: number;
  } {
    return {
      isInitialized: sharedDB !== null,
      initInProgress: dbInitInProgress,
      tablesInitialized,
      activeTransactions: activeTransactions.size,
    };
  }

  /**
   * Reset the database state (for testing)
   */
  async reset(): Promise<void> {
    if (sharedDB) {
      sharedDB.close();
    }
    sharedDB = null;
    dbInitPromise = null;
    dbInitInProgress = false;
    tableInitQueue = Promise.resolve();
    tablesInitialized = 0;
    activeTransactions.clear();
  }
}

/**
 * Default singleton instance of DatabaseManager
 */
export const databaseManager = new DatabaseManager();

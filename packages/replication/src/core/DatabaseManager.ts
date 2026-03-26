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
import type { Logger, DatabaseManagerDependencies } from '../dependencies';
import { noopLogger } from '../dependencies';
import {
  DB_NAME,
  DB_VERSION,
  DB_INIT_TIMEOUT_MS,
  INIT_RETRY_DELAY_MS,
  DELETE_DB_TIMEOUT_MS,
  CIRCUIT_BREAKER_THRESHOLD,
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
    store.createIndex('tableName_data.armband_number', ['tableName', 'data.armband_number'], {
      unique: false,
    });
  } else if (oldVersion < 3) {
    // Upgrade from v1/v2 to v3: Add query performance indexes if missing
    const store = transaction.objectStore(REPLICATION_STORES.REPLICATED_TABLES);

    if (!store.indexNames.contains('tableName_data.class_id')) {
      store.createIndex('tableName_data.class_id', ['tableName', 'data.class_id'], {
        unique: false,
      });
    }
    if (!store.indexNames.contains('tableName_data.trial_id')) {
      store.createIndex('tableName_data.trial_id', ['tableName', 'data.trial_id'], {
        unique: false,
      });
    }
    if (!store.indexNames.contains('tableName_data.show_id')) {
      store.createIndex('tableName_data.show_id', ['tableName', 'data.show_id'], { unique: false });
    }
    if (!store.indexNames.contains('tableName_data.armband_number')) {
      store.createIndex('tableName_data.armband_number', ['tableName', 'data.armband_number'], {
        unique: false,
      });
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
  private dbName: string;
  private dbVersion: number;
  private consecutiveFailures = 0;
  private circuitOpen = false;
  private isRecovering = false;

  constructor(dependencies: DatabaseManagerDependencies = {}, dbName?: string, dbVersion?: number) {
    this.logger = dependencies.logger ?? noopLogger;
    this.dbName = dbName ?? DB_NAME;
    this.dbVersion = dbVersion ?? DB_VERSION;
  }

  /**
   * Open the database with timeout protection
   */
  private async openDatabaseWithTimeout(): Promise<IDBPDatabase> {
    this.logger.log(
      `[DatabaseManager] About to call openDB("${this.dbName}", ${this.dbVersion})...`
    );

    const openDBPromise = openDB(this.dbName, this.dbVersion, {
      upgrade: (db, oldVersion, newVersion, transaction) => {
        this.logger.log(
          `[DatabaseManager] Upgrade callback triggered - oldVersion: ${oldVersion}, newVersion: ${newVersion}`
        );
        createObjectStores(db, oldVersion, transaction as unknown as IDBTransaction, this.logger);
      },
      blocked: () => {
        this.logger.warn(
          `[DatabaseManager] openDB blocked by existing connection — force-closing stale sharedDB`
        );
        if (sharedDB) {
          try {
            sharedDB.close();
          } catch {
            /* ignore */
          }
          sharedDB = null;
        }
      },
    }).then(db => {
      this.logger.log(`[DatabaseManager] openDB() promise resolved!`);
      db.onversionchange = () => {
        this.logger.warn(
          `[DatabaseManager] Another instance requested upgrade — closing connection`
        );
        db.close();
        sharedDB = null;
        dbInitPromise = null;
      };
      return db;
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `Database open timed out after ${DB_INIT_TIMEOUT_MS}ms - database may be corrupted or locked`
          )
        );
      }, DB_INIT_TIMEOUT_MS);
    });

    return Promise.race([openDBPromise, timeoutPromise]);
  }

  /**
   * Get the shared database instance
   * SINGLETON PATTERN: All tables share the same DB instance to prevent upgrade deadlocks
   */
  async getDatabase(tableName: string): Promise<IDBPDatabase> {
    this.logger.log(
      `[${tableName}] init() called - sharedDB: ${!!sharedDB}, dbInitPromise: ${!!dbInitPromise}`
    );

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
        const errorMsg =
          healthCheckError instanceof Error ? healthCheckError.message : String(healthCheckError);

        if (errorMsg.includes('closing')) {
          this.logger.warn(`[${tableName}] Database connection is closing, reinitializing...`);
        } else {
          this.logger.warn(
            `[${tableName}] Database health check failed, reinitializing...`,
            healthCheckError
          );
        }

        if (sharedDB) {
          try {
            sharedDB.close();
          } catch {
            // Ignore close errors
          }
        }

        if (
          errorMsg.includes('Object stores missing') ||
          errorMsg.includes('object stores was not found')
        ) {
          this.logger.warn(
            `[${tableName}] Corrupted database detected - deleting and recreating...`
          );
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
          this.logger.log(
            `[${tableName}] Waiting for ${activeTransactions.size} active transactions to complete...`
          );
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

      // Use circuit breaker recovery instead of legacy recoverFromCorruption()
      dbInitInProgress = false;
      dbInitPromise = null;
      sharedDB = null;

      await this.recover();

      // If recover() re-opened successfully, return it
      if (sharedDB) {
        return sharedDB;
      }

      throw error;
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
    consecutiveFailures: number;
    circuitOpen: boolean;
  } {
    return {
      isInitialized: sharedDB !== null,
      initInProgress: dbInitInProgress,
      tablesInitialized,
      activeTransactions: activeTransactions.size,
      consecutiveFailures: this.consecutiveFailures,
      circuitOpen: this.circuitOpen,
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
    this.consecutiveFailures = 0;
    this.circuitOpen = false;
    this.isRecovering = false;
  }

  /**
   * Record a getAll/init failure. Trips circuit breaker after threshold.
   */
  recordFailure(): void {
    this.consecutiveFailures++;
    this.logger.warn(
      `[DatabaseManager] Failure recorded (${this.consecutiveFailures}/${CIRCUIT_BREAKER_THRESHOLD})`
    );

    if (this.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD && !this.circuitOpen) {
      this.circuitOpen = true;
      this.logger.error(
        `[DatabaseManager] Circuit breaker tripped after ${this.consecutiveFailures} consecutive failures`
      );
      this.recover().catch(err => this.logger.error(`[DatabaseManager] Recovery failed:`, err));
    }
  }

  /**
   * Reset the failure counter (called after a successful operation)
   */
  resetFailures(): void {
    if (this.consecutiveFailures > 0) {
      this.consecutiveFailures = 0;
    }
    this.circuitOpen = false;
  }

  /**
   * Auto-recover: force-close, nuke IndexedDB, re-open, emit event
   */
  private async recover(): Promise<void> {
    if (this.isRecovering) return;
    this.isRecovering = true;

    this.logger.warn(`[DatabaseManager] Starting auto-recovery...`);

    // Step 1: Force-close existing connection
    if (sharedDB) {
      try {
        sharedDB.close();
      } catch {
        /* ignore */
      }
    }

    // Step 2: Null out all module-level state
    sharedDB = null;
    dbInitPromise = null;
    dbInitInProgress = false;
    tableInitQueue = Promise.resolve();
    tablesInitialized = 0;

    // Step 3: Try to delete IndexedDB (with short timeout — may hang if locked)
    try {
      await Promise.race([
        deleteDB(this.dbName),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('deleteDB timed out')), DELETE_DB_TIMEOUT_MS)
        ),
      ]);
      this.logger.log(`[DatabaseManager] IndexedDB deleted successfully`);
    } catch {
      this.logger.warn(
        `[DatabaseManager] deleteDB timed out or failed — proceeding without deletion`
      );
    }

    // Step 4: Try to re-open fresh
    try {
      dbInitPromise = this.openDatabaseWithTimeout();
      sharedDB = await dbInitPromise;
      this.logger.log(`[DatabaseManager] Database re-opened after recovery`);
    } catch (error) {
      this.logger.error(`[DatabaseManager] Failed to re-open database after recovery:`, error);
      dbInitPromise = null;
      sharedDB = null;
    }

    // Step 5: Reset circuit breaker state
    this.consecutiveFailures = 0;
    this.circuitOpen = false;
    this.isRecovering = false;

    // Step 6: Emit recovery event for the app layer
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('replication:recovery', { detail: { reason: 'circuit-breaker' } })
      );
    }
  }

  /**
   * Check if the circuit breaker is currently open
   */
  isCircuitOpen(): boolean {
    return this.circuitOpen;
  }
}

/**
 * Default singleton instance of DatabaseManager
 */
export const databaseManager = new DatabaseManager();

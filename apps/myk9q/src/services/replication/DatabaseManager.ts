/**
 * DatabaseManager - Shared IndexedDB Connection Management
 *
 * Extracted from ReplicatedTable.ts (DEBT-003) to improve maintainability.
 *
 * Responsibilities:
 * - Singleton database instance management
 * - Connection initialization with timeout protection
 * - Transaction queue to prevent stampede during multi-table init
 * - Corruption detection and recovery
 * - Race condition prevention
 */

import { openDB, deleteDB, IDBPDatabase } from 'idb';
import type { Logger } from './dependencies';
import {
  DB_NAME,
  DB_VERSION,
  DB_INIT_TIMEOUT_MS,
  INIT_RETRY_DELAY_MS,
} from './replicationConstants';

// Production dependencies - imported from actual modules
import { logger as defaultLogger } from '@/utils/logger';
import { logDiagnosticReport as defaultLogDiagnostics } from '@/utils/indexedDBDiagnostics';

/**
 * Object store names for the replication system
 * v4: Added PREFETCH_CACHE for consolidated IndexedDB (migrated from legacy myK9Q database)
 */
export const REPLICATION_STORES = {
  REPLICATED_TABLES: 'replicated_tables',
  SYNC_METADATA: 'sync_metadata',
  PENDING_MUTATIONS: 'pending_mutations',
  PREFETCH_CACHE: 'prefetch_cache', // v4: Consolidated from legacy myK9Q.cache store
  OFFLINE_QUEUE: 'offline_queue', // v5: Consolidated from legacy myK9Q.mutations store
} as const;

/**
 * Database state - singleton pattern
 * CRITICAL: All ReplicatedTable instances MUST share the same DB connection
 * to avoid upgrade transaction deadlocks when 16 tables initialize simultaneously
 */
let sharedDB: IDBPDatabase | null = null;
let dbInitPromise: Promise<IDBPDatabase> | null = null;

/**
 * Table initialization queue to prevent transaction stampede
 * When dbInitPromise resolves, all 16 tables try to create transactions simultaneously.
 * This queue ensures they take turns accessing the database to prevent deadlock.
 */
let tableInitQueue: Promise<void> = Promise.resolve();
let tablesInitialized = 0;

/**
 * PHASE 1 DAY 1 FIX: Atomic flag to prevent race condition in dbInitPromise assignment
 * Multiple tables can check "dbInitPromise === null" simultaneously and all try to create it.
 * This flag ensures only ONE table wins the race and creates the database connection.
 */
let dbInitInProgress = false;

/**
 * PHASE 1 DAY 2 FIX: Transaction tracking to prevent stampede
 * The 10ms delay in the initialization queue is a timing heuristic, not a guarantee.
 * This Set tracks ALL active transactions so we can wait for them to complete
 * before the next table starts its transactions, preventing deadlocks.
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

    // Day 23-24: Performance indexes for hot query paths
    // These indexes enable O(log n) queries instead of O(n) table scans
    store.createIndex('tableName_data.class_id', ['tableName', 'data.class_id'], { unique: false });
    store.createIndex('tableName_data.trial_id', ['tableName', 'data.trial_id'], { unique: false });
    store.createIndex('tableName_data.show_id', ['tableName', 'data.show_id'], { unique: false });
    store.createIndex('tableName_data.armband_number', ['tableName', 'data.armband_number'], { unique: false });
  } else if (oldVersion < 3) {
    // Upgrade from v1/v2 to v3: Add query performance indexes if missing
    const store = transaction.objectStore(REPLICATION_STORES.REPLICATED_TABLES);

    // Add new indexes if they don't exist
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

  // v4: Create prefetch_cache store (consolidated from legacy myK9Q database)
  // This store holds prefetch data with TTL expiration for the usePrefetch hook
  if (!db.objectStoreNames.contains(REPLICATION_STORES.PREFETCH_CACHE)) {
    logger.log(`[DatabaseManager] Creating PREFETCH_CACHE store (v4 consolidation)...`);
    const prefetchStore = db.createObjectStore(REPLICATION_STORES.PREFETCH_CACHE, {
      keyPath: 'key',
    });
    prefetchStore.createIndex('timestamp', 'timestamp', { unique: false });
    prefetchStore.createIndex('ttl', 'ttl', { unique: false });
  }

  // v5: Create offline_queue store (consolidated from legacy myK9Q.mutations)
  // This store holds offline score submissions for the offlineQueueStore
  if (!db.objectStoreNames.contains(REPLICATION_STORES.OFFLINE_QUEUE)) {
    logger.log(`[DatabaseManager] Creating OFFLINE_QUEUE store (v5 consolidation)...`);
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
 * Open the database with timeout protection
 */
async function openDatabaseWithTimeout(logger: Logger): Promise<IDBPDatabase> {
  logger.log(`[DatabaseManager] About to call openDB("${DB_NAME}", ${DB_VERSION})...`);

  const openDBPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      logger.log(`[DatabaseManager] Upgrade callback triggered - oldVersion: ${oldVersion}, newVersion: ${newVersion}`);
      createObjectStores(db, oldVersion, transaction as unknown as IDBTransaction, logger);
    },
  }).then((db) => {
    logger.log(`[DatabaseManager] openDB() promise resolved!`);
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
async function recoverFromCorruption(logger: Logger): Promise<IDBPDatabase> {
  // Import the config function
  const { handleDatabaseCorruption } = await import('./replicationConfig');

  // Database is corrupt or locked - disable replication and clean up
  logger.warn(`[DatabaseManager] Deleting corrupted database and disabling replication...`);

  // Handle the corruption (this will disable replication temporarily)
  handleDatabaseCorruption();

  await deleteDB(DB_NAME);
  logger.log(`[DatabaseManager] Database deleted successfully`);

  // Retry opening database (fresh start)
  const retryPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      logger.log(`[DatabaseManager] Retry upgrade - oldVersion: ${oldVersion}, newVersion: ${newVersion}`);
      createObjectStores(db, oldVersion, transaction as unknown as IDBTransaction, logger);
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
 * DatabaseManager class - manages shared IndexedDB connection
 */
export class DatabaseManager {
  private logger: Logger;

  constructor(logger: Logger = defaultLogger) {
    this.logger = logger;
  }

  /**
   * Get the shared database instance
   * SINGLETON PATTERN: All tables share the same DB instance to prevent upgrade deadlocks
   */
  async getDatabase(tableName: string): Promise<IDBPDatabase> {
    this.logger.log(`[${tableName}] init() called - sharedDB: ${!!sharedDB}, dbInitPromise: ${!!dbInitPromise}`);

    // Return shared instance if already initialized AND connection is healthy
    if (sharedDB) {
      // HEALTH CHECK: Verify connection is still valid
      // When IndexedDB is manually deleted from DevTools, the connection enters "closing" state
      // and any transaction on it will fail with "The database connection is closing"
      try {
        // Check 1: Verify object stores exist (synchronous, cheap)
        const storeNames = sharedDB.objectStoreNames;
        if (!storeNames.contains(REPLICATION_STORES.REPLICATED_TABLES)) {
          throw new Error('Object stores missing - database may have been recreated');
        }

        // Check 2: Try to start a transaction to detect "closing" state
        // This is the only reliable way to detect a stale connection
        // Note: Creating a transaction on a closing DB throws synchronously
        // We don't need to do anything with the transaction - just creating it verifies the connection
        sharedDB.transaction(REPLICATION_STORES.SYNC_METADATA, 'readonly');
        // Transaction auto-completes immediately (readonly with no operations)

        this.logger.log(`[${tableName}] Using existing sharedDB (health check passed)`);
        return sharedDB;
      } catch (healthCheckError) {
        // Connection is stale - reset and reinitialize
        const errorMsg = healthCheckError instanceof Error ? healthCheckError.message : String(healthCheckError);

        // Only log warning if this is a "closing" error (expected after manual delete)
        // Other errors should be logged as errors
        if (errorMsg.includes('closing')) {
          this.logger.warn(`[${tableName}] Database connection is closing, reinitializing...`);
        } else {
          this.logger.warn(`[${tableName}] Database health check failed, reinitializing...`, healthCheckError);
        }

        // Close the stale connection
        if (sharedDB) {
          try {
            sharedDB.close();
          } catch {
            // Ignore close errors - connection may already be closed
          }
        }

        // CRITICAL: If object stores are missing, the database is corrupted
        // We must DELETE the entire database and recreate it fresh
        // This happens after "Clear Site Data" in DevTools which can leave
        // the database in a partial state
        if (errorMsg.includes('Object stores missing') || errorMsg.includes('object stores was not found')) {
          this.logger.warn(`[${tableName}] Corrupted database detected - deleting and recreating...`);
          try {
            await deleteDB(DB_NAME);
            this.logger.log(`[${tableName}] Corrupted database deleted successfully`);
          } catch (deleteError) {
            this.logger.error(`[${tableName}] Failed to delete corrupted database:`, deleteError);
            // Continue anyway - openDB might still work
          }
        }

        sharedDB = null;
        dbInitPromise = null;
        dbInitInProgress = false;
        tableInitQueue = Promise.resolve();
        tablesInitialized = 0;
        // Fall through to reinitialize
      }
    }

    // If initialization is in progress, wait for it AND join the queue
    if (dbInitPromise) {
      this.logger.log(`[${tableName}] Waiting for dbInitPromise to resolve...`);

      // Wait for database to open
      const db = await dbInitPromise;
      this.logger.log(`[${tableName}] dbInitPromise resolved successfully`);

      // CRITICAL FIX: Join the initialization queue to prevent transaction stampede
      // All 16 tables will wait here in sequence instead of creating transactions simultaneously
      const myTurn = tableInitQueue.then(async () => {
        tablesInitialized++;
        this.logger.log(`[${tableName}] My turn in queue (${tablesInitialized}/16)`);

        // PHASE 1 DAY 2 FIX: Wait for ALL active transactions to complete
        // The 10ms delay was a timing heuristic, not a guarantee.
        // We now wait for actual transaction completion to prevent deadlocks.
        if (activeTransactions.size > 0) {
          this.logger.log(`[${tableName}] Waiting for ${activeTransactions.size} active transactions to complete...`);
          await Promise.all(Array.from(activeTransactions));
          this.logger.log(`[${tableName}] All active transactions complete`);
        }

        this.logger.log(`[${tableName}] Queue slot complete, ready for transactions`);
      });

      // Update queue for next table
      tableInitQueue = myTurn;

      // Wait for my turn before returning
      await myTurn;

      return db;
    }

    // PHASE 1 DAY 1 FIX: Atomic compare-and-swap to prevent race condition
    // Check if another thread is currently initializing the database
    if (dbInitInProgress) {
      this.logger.log(`[${tableName}] Another thread is initializing DB, waiting...`);
      // Wait a bit and retry (another thread won the race)
      await new Promise(resolve => setTimeout(resolve, INIT_RETRY_DELAY_MS));
      return this.getDatabase(tableName); // Recursive retry
    }

    // WE WON THE RACE - set flag atomically before creating dbInitPromise
    dbInitInProgress = true;
    this.logger.log(`[${tableName}] Won initialization race, creating database...`);

    // Start initialization (only one table will execute this)
    this.logger.log(`[${tableName}] Starting new DB initialization...`);

    try {
      // CRITICAL: Set dbInitPromise BEFORE awaiting to prevent race condition
      // All other tables will wait on this promise instead of starting their own initialization
      dbInitPromise = openDatabaseWithTimeout(this.logger);
      sharedDB = await dbInitPromise;

      this.logger.log(`[DatabaseManager] Shared database initialized successfully`);

      // PHASE 1 DAY 1 FIX: Release the initialization flag on success
      dbInitInProgress = false;

      return sharedDB;
    } catch (error) {
      this.logger.error(`[DatabaseManager] Failed to open database:`, error);

      try {
        // PHASE 1 DAY 3 FIX: Use separate variable for retry promise
        // Don't overwrite dbInitPromise - other threads might be waiting on it!
        sharedDB = await recoverFromCorruption(this.logger);

        // NOW update dbInitPromise to point to the new database
        dbInitPromise = Promise.resolve(sharedDB);

        this.logger.log(`[DatabaseManager] Database recreated successfully after corruption`);

        // PHASE 1 DAY 1 FIX: Release the initialization flag on success
        dbInitInProgress = false;

        // Reset queue state for clean retry
        tableInitQueue = Promise.resolve();
        tablesInitialized = 0;

        return sharedDB;
      } catch (retryError) {
        this.logger.error(`[DatabaseManager] Failed to recreate database after deletion:`, retryError);

        // Database is completely stuck - run diagnostics
        this.logger.error(`[DatabaseManager] Database is locked/corrupted - running diagnostics...`);

        // Run diagnostic report in background
        setTimeout(() => {
          Promise.resolve(defaultLogDiagnostics()).catch(err => {
            this.logger.error('[DatabaseManager] Diagnostic report failed:', err);
          });
        }, 0);

        // PHASE 1 DAY 3 FIX: Only reset global state if no other threads are using the DB
        // If other threads have active transactions, don't destroy their state
        const currentlyInUse = activeTransactions.size > 0;
        if (!currentlyInUse) {
          this.logger.log(`[${tableName}] No active transactions, safe to reset global state`);
          dbInitPromise = null;
          sharedDB = null;
          tableInitQueue = Promise.resolve();
          tablesInitialized = 0;
        } else {
          this.logger.warn(
            `[${tableName}] Not resetting DB state - ${activeTransactions.size} active transactions. ` +
            `Other tables may still be using the database.`
          );
        }

        // PHASE 1 DAY 1 FIX: Release the initialization flag on failure
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
}

/**
 * Clean up duplicate records caused by numeric/string ID type mismatch
 *
 * IndexedDB stores records with compound key ['tableName', 'id'].
 * Due to a bug, some records were stored with numeric IDs while others
 * had string IDs, creating duplicates (e.g., ['classes', 2] and ['classes', '2']).
 *
 * This function:
 * 1. Quick-checks if any numeric IDs exist (early exit if none found)
 * 2. Groups records by tableName and normalized (string) ID
 * 3. For each group with duplicates, keeps only one record (preferring string ID)
 * 4. Deletes the duplicate records with numeric IDs
 *
 * Performance: O(n) scan with early exit when database is already clean.
 * After the first successful migration, subsequent calls exit in O(n) time
 * without any writes.
 *
 * @returns Promise<{cleaned: number, total: number}> - Number of duplicates removed
 */
export async function cleanupDuplicateRecords(): Promise<{ cleaned: number; total: number }> {
  const logger = defaultLogger;

  try {
    const db = await databaseManager.getDatabase('cleanup');

    // FAST PATH: Quick check for any numeric IDs before full scan
    // If all IDs are already strings, we can skip the expensive grouping logic
    const quickCheckTx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
    const allRecords = await quickCheckTx.store.getAll();
    const total = allRecords.length;

    if (total === 0) {
      return { cleaned: 0, total: 0 };
    }

    // FAST PATH: Check if any records have numeric IDs
    // If all IDs are strings, the database is already clean - skip expensive grouping
    const hasNumericIds = allRecords.some(record => {
      const typedRecord = record as { id: string | number };
      return typeof typedRecord.id === 'number';
    });

    if (!hasNumericIds) {
      // Database is already clean - no migration needed
      logger.log(`[DatabaseManager] ID cleanup check: ${total} records already normalized (no numeric IDs found)`);
      return { cleaned: 0, total };
    }

    // SLOW PATH: Found numeric IDs - need to do full migration
    logger.log(`[DatabaseManager] Found numeric IDs in ${total} records, starting migration...`);

    // Open a new readwrite transaction for the actual cleanup
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const store = tx.objectStore(REPLICATION_STORES.REPLICATED_TABLES);

    // Re-fetch records in the new transaction
    const recordsToProcess = await store.getAll();

    // Group records by tableName + normalized ID
    const recordsByKey = new Map<string, Array<{ key: IDBValidKey; hasNumericId: boolean; record: unknown }>>();

    for (const record of recordsToProcess) {
      const typedRecord = record as { tableName: string; id: string | number };
      const normalizedId = String(typedRecord.id);
      const groupKey = `${typedRecord.tableName}:${normalizedId}`;
      const recordHasNumericId = typeof typedRecord.id === 'number';

      if (!recordsByKey.has(groupKey)) {
        recordsByKey.set(groupKey, []);
      }
      recordsByKey.get(groupKey)!.push({
        key: [typedRecord.tableName, typedRecord.id] as IDBValidKey,
        hasNumericId: recordHasNumericId,
        record,
      });
    }

    // Find and delete duplicates
    let cleaned = 0;
    for (const [groupKey, records] of recordsByKey) {
      if (records.length > 1) {
        // Multiple records with same normalized ID - keep the string version, delete numeric versions
        logger.log(`[DatabaseManager] Found ${records.length} duplicates for ${groupKey}`);

        // Sort: string IDs first, then numeric
        records.sort((a, b) => {
          if (a.hasNumericId && !b.hasNumericId) return 1; // Numeric goes last
          if (!a.hasNumericId && b.hasNumericId) return -1; // String goes first
          return 0;
        });

        // Keep the first (string ID), delete the rest
        for (let i = 1; i < records.length; i++) {
          await store.delete(records[i].key);
          cleaned++;
          logger.log(`[DatabaseManager] Deleted duplicate: ${JSON.stringify(records[i].key)}`);
        }
      } else if (records.length === 1 && records[0].hasNumericId) {
        // Single record with numeric ID - migrate it to string ID
        // ReplicatedRow structure: { tableName, id, data: { id, ...entity }, ... }
        type ReplicatedRecord = {
          tableName: string;
          id: number | string;
          data?: { id?: number | string; [key: string]: unknown };
          [key: string]: unknown;
        };
        const record = records[0].record as ReplicatedRecord;
        const oldKey = records[0].key;
        const newId = String(record.id);

        // Update the record with string ID
        const updatedRecord = { ...record, id: newId };

        // Also update the nested data.id if it exists
        if (updatedRecord.data && typeof updatedRecord.data.id !== 'undefined') {
          updatedRecord.data = { ...updatedRecord.data, id: newId };
        }

        // Delete old record and add new one
        await store.delete(oldKey);
        await store.put(updatedRecord);
        cleaned++;
        logger.log(`[DatabaseManager] Migrated numeric ID to string: ${record.tableName}:${record.id} -> ${newId}`);
      }
    }

    await tx.done;

    logger.log(`[DatabaseManager] Cleanup complete: ${cleaned} records fixed out of ${total} total`);
    return { cleaned, total };
  } catch (error) {
    defaultLogger.error('[DatabaseManager] Cleanup failed:', error);
    throw error;
  }
}

/**
 * Singleton instance of DatabaseManager
 */
export const databaseManager = new DatabaseManager();

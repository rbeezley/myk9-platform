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

import { openDB, IDBPDatabase } from 'idb';
import type { Logger, DatabaseManagerDependencies } from '../dependencies';
import { noopLogger } from '../dependencies';
import {
  DB_NAME,
  DB_VERSION,
  DB_INIT_TIMEOUT_MS,
  INIT_RETRY_DELAY_MS,
  CIRCUIT_BREAKER_THRESHOLD,
} from '../constants';
import { withTimeout } from '../mutation-utils';
import {
  StaleSchemaError,
  getStaleSchemaLatch,
  isVersionError,
  latchStaleSchema,
  resetStaleSchemaLatch,
} from './staleSchema';

/**
 * Object store names for the replication system
 */
export const REPLICATION_STORES = {
  REPLICATED_TABLES: 'replicated_tables',
  SYNC_METADATA: 'sync_metadata',
  PENDING_MUTATIONS: 'pending_mutations',
  FAILED_MUTATIONS: 'failed_mutations',
  PREFETCH_CACHE: 'prefetch_cache',
  OFFLINE_QUEUE: 'offline_queue',
} as const;

/**
 * The offline database at this version lacks stores this build needs. It is
 * never deleted automatically: it may still hold the only copy of queued
 * scores (MYK9-2360). Clearing site data is the manual fix.
 */
export class DamagedDatabaseError extends Error {
  readonly missingStores: string[];
  constructor(missingStores: string[]) {
    super(`Offline database is damaged: missing ${missingStores.join(', ')}`);
    this.name = 'DamagedDatabaseError';
    this.missingStores = missingStores;
  }
}

/**
 * Database state - singleton pattern
 * CRITICAL: All ReplicatedTable instances MUST share the same DB connection
 * to avoid upgrade transaction deadlocks when multiple tables initialize simultaneously
 */
let sharedDB: IDBPDatabase | null = null;
let dbInitPromise: Promise<IDBPDatabase> | null = null;
/** MYK9-2420: set while the init winner's recover() runs, so waiters can adopt its handle. */
let initRecovery: Promise<void> | null = null;

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
 * Indexes an earlier schema created on `replicated_tables` that nothing reads.
 * The upgrade deletes any a device still carries.
 */
export const RETIRED_REPLICATED_TABLE_INDEXES = [
  'tableName_data.class_id',
  'tableName_data.trial_id',
  'tableName_data.show_id',
  'tableName_data.armband_number',
] as const;

/**
 * One show's rows of one table (MYK9-788). Keyed on the mapped row's camelCase
 * `showId`; a row without one is simply not in the index. Unlike the retired
 * `data.*` indexes above, this one has a reader: a show-scoped read no longer
 * scans every show's rows on the device.
 */
export const SHOW_ID_INDEX = 'tableName_showId';

/**
 * One class's rows / one trial's rows of one table (MYK9-1366), keyed on the
 * mapped row's camelCase `classId` / `trialId` exactly as the show index is on
 * `showId`. Read by `getByClassWithStatus` / `getByTrialWithStatus`.
 */
export const CLASS_ID_INDEX = 'tableName_classId';
export const TRIAL_ID_INDEX = 'tableName_trialId';

/** The scope indexes added after v8, in creation order: name and key path. */
const SCOPE_INDEXES: readonly ReplicationIndexDefinition[] = [
  { name: SHOW_ID_INDEX, keyPath: ['tableName', 'data.showId'], unique: false },
  { name: CLASS_ID_INDEX, keyPath: ['tableName', 'data.classId'], unique: false },
  { name: TRIAL_ID_INDEX, keyPath: ['tableName', 'data.trialId'], unique: false },
];

/**
 * One IndexedDB index, as `createObjectStores` builds it on a fresh database.
 */
export interface ReplicationIndexDefinition {
  readonly name: string;
  readonly keyPath: string | string[];
  readonly unique: boolean;
}

/**
 * One IndexedDB object store, as `createObjectStores` builds it on a fresh
 * database. A seed that opens `myK9_Replication` outside the app (e2e tests)
 * must reuse this instead of hand-copying store/index names, so a DB version
 * bump here can't silently diverge from what the seed creates (MYK9-793).
 */
export interface ReplicationStoreDefinition {
  readonly name: string;
  readonly keyPath: string | string[];
  readonly indexes: readonly ReplicationIndexDefinition[];
}

export const REPLICATION_SCHEMA: readonly ReplicationStoreDefinition[] = [
  {
    name: REPLICATION_STORES.REPLICATED_TABLES,
    keyPath: ['tableName', 'id'],
    indexes: [
      { name: 'tableName', keyPath: 'tableName', unique: false },
      { name: 'tableName_lastSyncedAt', keyPath: ['tableName', 'lastSyncedAt'], unique: false },
      { name: 'isDirty', keyPath: 'isDirty', unique: false },
      ...SCOPE_INDEXES,
    ],
  },
  {
    name: REPLICATION_STORES.SYNC_METADATA,
    keyPath: 'tableName',
    indexes: [],
  },
  {
    name: REPLICATION_STORES.PENDING_MUTATIONS,
    keyPath: 'id',
    indexes: [
      { name: 'status', keyPath: 'status', unique: false },
      { name: 'tableName', keyPath: 'tableName', unique: false },
      { name: 'tableName_rowId', keyPath: ['tableName', 'rowId'], unique: false },
    ],
  },
  {
    name: REPLICATION_STORES.PREFETCH_CACHE,
    keyPath: 'key',
    indexes: [
      { name: 'timestamp', keyPath: 'timestamp', unique: false },
      { name: 'ttl', keyPath: 'ttl', unique: false },
    ],
  },
  {
    name: REPLICATION_STORES.FAILED_MUTATIONS,
    keyPath: 'id',
    indexes: [
      { name: 'tableName', keyPath: 'tableName', unique: false },
      { name: 'failedAt', keyPath: 'failedAt', unique: false },
    ],
  },
  {
    name: REPLICATION_STORES.OFFLINE_QUEUE,
    keyPath: 'id',
    indexes: [
      { name: 'status', keyPath: 'status', unique: false },
      { name: 'timestamp', keyPath: 'timestamp', unique: false },
      { name: 'type', keyPath: 'type', unique: false },
    ],
  },
];

function createStoreFromDefinition(db: IDBPDatabase, definition: ReplicationStoreDefinition): void {
  const store = db.createObjectStore(definition.name, { keyPath: definition.keyPath });
  for (const index of definition.indexes) {
    store.createIndex(index.name, index.keyPath, { unique: index.unique });
  }
}

/**
 * Create the IndexedDB object stores during upgrade
 */
function createObjectStores(db: IDBPDatabase, transaction: IDBTransaction, logger: Logger): void {
  for (const definition of REPLICATION_SCHEMA) {
    if (!db.objectStoreNames.contains(definition.name)) {
      logger.log(`[DatabaseManager] Creating ${definition.name} store...`);
      createStoreFromDefinition(db, definition);
      continue;
    }

    if (definition.name === REPLICATION_STORES.REPLICATED_TABLES) {
      // v8 (MYK9-616): drop the compound `data.*` indexes. Their only reader,
      // `ReplicatedTableQueryManager.queryIndex`, was deleted by MYK9-551, so
      // each one cost a write on every row `put` and served no read. Deleting an
      // index leaves the store's records untouched, so dirty rows survive.
      const store = transaction.objectStore(REPLICATION_STORES.REPLICATED_TABLES);
      for (const indexName of RETIRED_REPLICATED_TABLE_INDEXES) {
        if (store.indexNames.contains(indexName)) {
          store.deleteIndex(indexName);
        }
      }
      // v9 (MYK9-788) show index, v10 (MYK9-1366) class and trial indexes: each
      // is read by a scoped reader. Building one indexes the records already on
      // the device; none is rewritten.
      for (const index of SCOPE_INDEXES) {
        if (!store.indexNames.contains(index.name)) {
          store.createIndex(index.name, index.keyPath, { unique: index.unique });
        }
      }
    } else if (definition.name === REPLICATION_STORES.PENDING_MUTATIONS) {
      const mutationStore = transaction.objectStore(REPLICATION_STORES.PENDING_MUTATIONS);
      if (!mutationStore.indexNames.contains('tableName_rowId')) {
        mutationStore.createIndex('tableName_rowId', ['tableName', 'rowId'], { unique: false });
      }
    }
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
  /** MYK9-2420: the recovery now running, so a second caller can wait for its handle. */
  private recoveryInFlight: Promise<void> | null = null;

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
        createObjectStores(db, transaction as unknown as IDBTransaction, this.logger);
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
      const missing = Object.values(REPLICATION_STORES).filter(
        store => !db.objectStoreNames.contains(store)
      );
      if (missing.length > 0) {
        db.close();
        throw new DamagedDatabaseError(missing);
      }
      db.onversionchange = event => {
        this.logger.warn(
          `[DatabaseManager] Another instance requested upgrade — closing connection`
        );
        db.close();
        sharedDB = null;
        dbInitPromise = null;
        // newVersion === null is a deleteDB (site data cleared): reconnect
        // on the next call. A number is a newer build upgrading: this build is stale.
        if (event.newVersion !== null) latchStaleSchema('version-change');
      };
      return db;
    });

    return withTimeout(openDBPromise, DB_INIT_TIMEOUT_MS, 'Database open');
  }

  /**
   * Get the shared database instance
   * SINGLETON PATTERN: All tables share the same DB instance to prevent upgrade deadlocks
   */
  async getDatabase(tableName: string): Promise<IDBPDatabase> {
    const stale = getStaleSchemaLatch();
    if (stale) throw new StaleSchemaError(stale);

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

      let db: IDBPDatabase;
      try {
        db = await dbInitPromise;
      } catch (initError) {
        // MYK9-2420: the winner's recover() may have re-opened the database; adopt
        // that handle instead of reporting the original failure to this caller.
        if (initRecovery) await initRecovery.catch(() => undefined);
        if (!sharedDB) throw initError;
        return sharedDB;
      }
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

      dbInitInProgress = false;
      dbInitPromise = null;
      sharedDB = null;

      // MYK9-1663: this build is older than the device's database. recover()
      // deletes the database, which would discard queued offline scores the
      // newer build can still replay, so report it and leave the data alone.
      if (isVersionError(error)) {
        latchStaleSchema('version-error');
        throw error;
      }
      // Reopening a damaged database cannot repair it, and deleting it would
      // destroy the queued scores it still holds (MYK9-2360).
      if (error instanceof DamagedDatabaseError) throw error;

      initRecovery = this.recover();
      try {
        await initRecovery;
      } finally {
        initRecovery = null;
      }

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
    this.recoveryInFlight = null;
    resetStaleSchemaLatch();
  }

  /**
   * Record a getAll/init failure. Trips circuit breaker after threshold.
   */
  recordFailure(): void {
    // A stale schema is not a failing database; never count it toward recover().
    if (getStaleSchemaLatch()) return;
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
    if (this.consecutiveFailures > 0) this.consecutiveFailures = 0;
    if (this.circuitOpen) this.circuitOpen = false;
  }

  /**
   * Auto-recover: force-close, re-open, emit event. Never deletes the database:
   * it holds the only copy of the queued scores (MYK9-2360).
   */
  private async recover(): Promise<void> {
    // MYK9-1663: the newer build owns this database and its queued scores.
    if (getStaleSchemaLatch()) {
      this.logger.warn(`[DatabaseManager] Stale schema latched — refusing to reopen the database`);
      return;
    }
    // MYK9-2420: a caller that arrives mid-recovery (an init failure overlapping a
    // circuit-breaker recovery) waits for that one instead of returning at once.
    if (this.isRecovering) return this.recoveryInFlight ?? undefined;
    this.isRecovering = true;
    const run = this.runRecovery();
    this.recoveryInFlight = run;
    try {
      await run;
    } finally {
      if (this.recoveryInFlight === run) this.recoveryInFlight = null;
    }
  }

  private async runRecovery(): Promise<void> {
    this.logger.warn(`[DatabaseManager] Starting auto-recovery...`);

    if (sharedDB) {
      try {
        sharedDB.close();
      } catch {
        /* ignore */
      }
    }

    sharedDB = null;
    dbInitPromise = null;
    dbInitInProgress = false;
    tableInitQueue = Promise.resolve();
    tablesInitialized = 0;

    try {
      dbInitPromise = this.openDatabaseWithTimeout();
      sharedDB = await dbInitPromise;
      this.logger.log(`[DatabaseManager] Database re-opened after recovery`);
    } catch (error) {
      this.logger.error(`[DatabaseManager] Failed to re-open database after recovery:`, error);
      dbInitPromise = null;
      sharedDB = null;
    }

    this.consecutiveFailures = 0;
    this.circuitOpen = false;
    this.isRecovering = false;

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

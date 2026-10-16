/**
 * ReplicatedTable - Generic Base Class for Table Replication
 *
 * Provides CRUD operations with automatic caching, sync, and conflict resolution.
 * All table-specific implementations extend this class.
 *
 * Features:
 * - Offline-first data access
 * - Capacity-based cache management without wall-clock expiry
 * - Optimistic updates with version tracking
 * - Subscription-based reactive updates
 * - LRU/LFU cache eviction
 */

import type { RepairStuckPendingFlagsResult, StuckRepairAdapter } from './repairStuckPendingFlags';
import type { IDBPDatabase, IDBPObjectStore } from 'idb';
import type {
  ReplicatedRow,
  ReplicationConflictResolution,
  ReplicationConflictSnapshot,
  SyncMetadata,
  SyncResult,
  SyncOptions,
  CacheStats,
  ReplicatedReadResult,
  PendingMutation,
} from '../types';
import type { Logger, ReplicatedTableDependencies } from '../dependencies';
import { noopLogger } from '../dependencies';
import type { MutationManager } from '../MutationManager';
import {
  fetchRowForDiscard,
  refetchDirtyRowsById,
  type RowRefetchAdapter,
} from '../refetchDirtyRowsById';
import { MAX_OPTIMISTIC_UPDATE_RETRIES } from '../constants';
import { createWrittenFieldOverlay } from '../mutation-written-overlay';

import { databaseManager, REPLICATION_STORES, trackTransaction } from './DatabaseManager';
import {
  ReplicatedTableCacheManager,
  type ReplicatedTableSubscriptionOptions,
} from './ReplicatedTableCache';
import { ReplicatedTableBatchManager } from './ReplicatedTableBatch';
import { ReplicatedTableQueryManager, type RowVisibility } from './ReplicatedTableQuery';
import { RowLockRegistry } from './RowLockRegistry';
import {
  applyConflictSnapshot,
  buildRemoteReplacementRow,
  clearConflictSnapshot,
  getConflictSnapshots,
} from './ReplicatedTableConflict';
import {
  buildReconciledDirtyRow,
  buildReplicatedRowForSet,
  buildSyncedReplicatedRow,
  isOlderThanRow,
  selectStaleCleanRows,
} from './ReplicatedTableRowState';
import {
  instantFieldsFor,
  mergeNonConflictingServerFields,
} from '../conflict/detectDirtyRowConflict';
import type { ScopeStampDirective } from './scopeStamp';
import { isConflictSurfacingEnabled } from '../conflictConfig';
import { withQuotaEviction } from '../quota-eviction';
import {
  composeRetrySetOptions,
  isColdInsertAllowed,
  type ColdInsertGuardMode,
  type ReplicatedSetOptions,
  type ReplicatedSetResult,
} from './coldInsertGuard';

/** What one {@link ReplicatedTable.set} call learns across its retried attempts. */
interface SetAttempt {
  rowExisted: boolean;
  /** The row's local revision after the write that landed. */
  revision?: number;
}

/**
 * Fraction of a table's current footprint to retain when relieving storage
 * quota pressure — evict roughly the remaining 30% (oldest/least-used first).
 */
const QUOTA_EVICTION_RETAIN_FRACTION = 0.7;

// Re-export REPLICATION_STORES for backward compatibility
export { REPLICATION_STORES } from './DatabaseManager';

/**
 * Generic replicated table base class
 *
 * @template T - Type of the table row (must have an 'id' field)
 */
export abstract class ReplicatedTable<T extends { id: string }> {
  protected db: IDBPDatabase | null = null;

  /** Injected dependencies */
  protected readonly logger: Logger;

  /** Extracted cache manager */
  private cacheManager: ReplicatedTableCacheManager<T>;

  /** Extracted batch manager */
  private batchManager: ReplicatedTableBatchManager<T>;

  /** Extracted row lock registry */
  private rowLocks: RowLockRegistry;

  /** Extracted query manager */
  private queryManager: ReplicatedTableQueryManager<T>;

  constructor(
    protected tableName: string,
    dependencies: ReplicatedTableDependencies = {}
  ) {
    // Inject dependencies with defaults
    this.logger = dependencies.logger ?? noopLogger;
    // Initialize extracted managers
    this.cacheManager = new ReplicatedTableCacheManager<T>(
      tableName,
      this.logger,
      () => this.init(),
      () => this.getAllWithStatus()
    );

    this.batchManager = new ReplicatedTableBatchManager<T>(
      tableName,
      this.logger,
      () => this.init(),
      () => this.notifyListeners(),
      () => this.relieveQuota(),
      id => this.acceptsRemoteRow(id)
    );

    this.queryManager = new ReplicatedTableQueryManager<T>(tableName, this.logger, () =>
      this.init()
    );

    this.rowLocks = new RowLockRegistry();
  }

  // ========================================
  // MUTATION MANAGER
  // ========================================

  /** MutationManager reference (set by app at startup) */
  private mutationManager: MutationManager | null = null;
  /** Locks acquired before dirty cache writes are released after queueing. */
  private readonly pendingWriteLocks = new Map<string, Array<() => void>>();
  /**
   * The revision each dirty write produced, waiting for its queueMutation to
   * stamp it as `rowRevision` (MYK9-1076). FIFO per row, the same pairing as
   * pendingWriteLocks. A dirty write that never queues leaves an older entry
   * behind, which can only make a later stamp too old: that blocks a revert,
   * it never allows a wrong one.
   */
  private readonly pendingWriteRevisions = new Map<string, number[]>();

  /**
   * Opt in to putting a row back to its last known server state when the user
   * discards its failed UPDATE or DELETE (MYK9-1076, revertDiscardedRowWrite).
   * Off by default: ringside and entries keep today's Discard behaviour.
   */
  protected readonly revertsOnDiscard: boolean = false;
  /** Rows whose mutation was queued first with deferUpload=true. */
  private readonly deferredMutationRows = new Map<string, number>();
  /** Queue locks retained until the dependent deferred dirty writes complete. */
  private readonly deferredWriteLocks = new Map<string, Array<() => void>>();

  /**
   * Connect this table to a MutationManager for mutation upload.
   * Must be called once at app startup before any writes.
   */
  setMutationManager(manager: MutationManager): void {
    this.mutationManager = manager;
    this.unregisterRowRefetcher?.();
    const getAdapter = this.getRowRefetchAdapter?.bind(this);
    this.unregisterRowRefetcher = getAdapter
      ? manager.rowRefetchers.register(this.tableName, rowIds =>
          refetchDirtyRowsById(this, getAdapter(), rowIds)
        )
      : undefined;
    this.unregisterWrittenOverlay?.();
    const adapter = getAdapter?.();
    this.unregisterWrittenOverlay = adapter?.toRemoteRow
      ? manager.writtenOverlays?.register(
          this.tableName,
          createWrittenFieldOverlay({
            toLocalRow: remote => adapter.toLocalRow(remote),
            toRemoteRow: local => adapter.toRemoteRow!(local),
          })
        )
      : undefined;
    this.unregisterOwnerTransfer?.();
    this.unregisterOwnerTransfer = manager.ownerTransfers?.register(
      this.tableName,
      (ids, from, to) => this.transferRowOwnership(ids, from, to)
    );
    this.unregisterDiscardReverter?.();
    this.unregisterDiscardReverter = this.revertsOnDiscard
      ? manager.discardReverters.register(this.tableName, {
          onChanged: () => this.notifyListeners(),
          fetchRow: getAdapter ? rowId => fetchRowForDiscard(getAdapter(), rowId) : undefined,
        })
      : undefined;
  }

  private unregisterRowRefetcher: (() => void) | undefined;
  private unregisterWrittenOverlay: (() => void) | undefined;
  private unregisterOwnerTransfer: (() => void) | undefined;
  private unregisterDiscardReverter: (() => void) | undefined;

  /**
   * The download-adapter slice that re-reads rows by id, used after a full-row
   * UPDATE is rejected for a stale OCC token (MYK9-771): the row is fetched
   * and reconciled, which rebases the write or surfaces a same-field conflict.
   * Tables that queue full-row UPDATEs implement it with a `fetchRowsById` that
   * reads the way their sync does. Tables without it keep the write backing
   * off, unchanged.
   */
  protected getRowRefetchAdapter?(): RowRefetchAdapter<unknown, T>;

  /**
   * Get the number of pending mutations in the queue.
   * Useful for subclasses to guard cleanup operations.
   */
  protected async getMutationPendingCount(): Promise<number> {
    if (!this.mutationManager) return 0;
    return this.mutationManager.getPendingCount();
  }

  /**
   * Return pending mutation ids for a row in this table.
   * Used by dependency-aware local creates without exposing queue storage.
   */
  public async getPendingMutationIdsForRow(rowId: string): Promise<string[]> {
    if (!this.mutationManager) return [];
    const mutations = await this.mutationManager.getPendingMutationsForRow(this.tableName, rowId);
    return mutations.map(mutation => mutation.id);
  }

  /**
   * The signed-in user's undelivered mutations for a row: pending, or failed
   * and kept for Retry or Discard. Both queue reads are owner-scoped by the
   * manager, so another account's work on this device is never named.
   */
  public async getUnsentMutationIdsForRow(rowId: string): Promise<string[]> {
    if (!this.mutationManager) return [];
    const id = String(rowId);
    const [pending, failed] = await Promise.all([
      this.mutationManager.getPendingMutationsForRow(this.tableName, id),
      this.mutationManager.getFailedMutations(),
    ]);
    const failedHere = failed.filter(m => m.tableName === this.tableName && String(m.rowId) === id);
    return [...pending, ...failedHere].map(mutation => mutation.id);
  }

  /**
   * True when this device holds work for the row that the server may not have:
   * the row is dirty or exists only locally (`_localOnly`), or a pending or
   * failed mutation points at it. Callers that purge a row for a server-side
   * removal use this at purge time, so a create or edit queued a moment earlier
   * (this tab or another) is left for normal sync instead of being dropped.
   * Throws when the queue cannot be read: an unreadable queue is never a pass.
   */
  public async hasUnsyncedLocalWork(rowId: string): Promise<boolean> {
    const id = String(rowId);
    // Whoever owns the row: its unsent work is not ours to purge either.
    const row = await this.getReplicatedRowIncludingOtherAccounts(id);
    if (!row) return false;
    const data = row.data as { _localOnly?: unknown } | null;
    if (row.isDirty || data?._localOnly === true) return true;
    if (!this.mutationManager) return false;
    const [pending, failed] = await Promise.all([
      this.mutationManager.getPendingMutationsForRow(this.tableName, id),
      this.mutationManager.getFailedMutations(),
    ]);
    return (
      pending.length > 0 ||
      failed.some(m => m.tableName === this.tableName && String(m.rowId) === id)
    );
  }

  /**
   * Rebuild a full Supabase UPDATE payload from a local row after conflict
   * resolution. Subclasses with direct full-row UPDATE mutations should override
   * this with their table mapper; RPC/delta-only tables can keep the default.
   */
  protected rebuildUpdatePayload(_row: T): Record<string, unknown> | undefined {
    return undefined;
  }

  /**
   * Return DB keys that a legacy full-row mutation must not restore when its
   * rebuild omits them. Legacy queues lack explicitDataKeys, so adapters with
   * server-owned fields can preserve server-wins behavior without changing the
   * generic legacy payload contract for other tables.
   */
  protected getLegacyOmittedKeysServerWins(): readonly string[] | undefined {
    return undefined;
  }

  /**
   * The show a ringside RPC mutation on this row belongs to, stamped at enqueue
   * so a fresh passcode session can adopt it (MYK9-1205). Defaults to the stored
   * row's own show id; tables whose rows reach a show another way override it.
   * Undefined means the mutation is never adoptable, the safe default.
   */
  protected async resolveMutationShowId(rowId: string): Promise<string | undefined> {
    try {
      const db = await databaseManager.getDatabase(this.tableName);
      const row = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, [
        this.tableName,
        String(rowId),
      ])) as ReplicatedRow<Record<string, unknown>> | undefined;
      const showId = row?.data?.showId ?? row?.data?.show_id;
      return typeof showId === 'string' && showId.length > 0 ? showId : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Queue a mutation for upload to Supabase.
   * Subclasses call this after set() with the Supabase-format payload.
   */
  protected async queueMutation(
    operation: 'INSERT' | 'UPDATE' | 'DELETE',
    rowId: string,
    supabasePayload: Record<string, unknown>,
    dependsOn?: string[],
    /** Optional: apply via a SECURITY DEFINER RPC (see PendingMutation.rpc). */
    rpc?: PendingMutation['rpc'],
    /**
     * When true, persist the mutation but DON'T schedule the upload yet — the
     * caller will mark the cache row dirty and then call {@link requestUpload}.
     * Prevents an online flush from deleting the mutation before the dirty row
     * exists (which would strand the row as pending).
     */
    deferUpload = false
  ): Promise<string | null> {
    if (!this.mutationManager) {
      this.logger.warn(`[${this.tableName}] No MutationManager set — mutation not queued`);
      return null;
    }

    const lockKey = String(rowId);
    if (deferUpload) {
      this.deferredMutationRows.set(lockKey, (this.deferredMutationRows.get(lockKey) ?? 0) + 1);
    }
    // A deferred queue runs BEFORE its dirty write, so it has no revision yet.
    const rowRevision = deferUpload ? undefined : this.takeWriteRevision(lockKey);
    const pendingLocks = this.pendingWriteLocks.get(lockKey);
    const releaseLocalWriteLock = pendingLocks?.shift();
    if (pendingLocks && pendingLocks.length === 0) this.pendingWriteLocks.delete(lockKey);
    const releaseQueueLock =
      releaseLocalWriteLock ?? (await this.mutationManager.acquireMutationWriteLock?.());
    const retainQueueLockForDeferredWrite = deferUpload && releaseQueueLock !== undefined;
    let queueSucceeded = false;

    try {
      // Capture the server-side version for OCC precondition on UPDATE — but only
      // when conflict surfacing is enabled. When the flag is off, no precondition is
      // attached and last-write-wins behavior is preserved end-to-end (the kill-switch
      // contract documented in syncReplicatedTable.ts).
      let serverVersion: number | undefined;
      if (operation === 'UPDATE' && isConflictSurfacingEnabled()) {
        const db = await databaseManager.getDatabase(this.tableName);
        const row = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, [
          this.tableName,
          String(rowId),
        ])) as ReplicatedRow<unknown> | undefined;
        serverVersion = row?.serverVersion;
      }

      const mutationId = await this.mutationManager.queueMutation(
        this.tableName,
        operation,
        rowId,
        supabasePayload,
        dependsOn,
        serverVersion,
        rpc,
        !deferUpload,
        rowRevision,
        rpc ? await this.resolveMutationShowId(rowId) : undefined
      );
      queueSucceeded = true;
      return mutationId;
    } finally {
      if (!queueSucceeded && deferUpload) {
        const deferredCount = this.deferredMutationRows.get(lockKey) ?? 0;
        if (deferredCount <= 1) this.deferredMutationRows.delete(lockKey);
        else this.deferredMutationRows.set(lockKey, deferredCount - 1);
      }
      if (queueSucceeded && retainQueueLockForDeferredWrite) {
        const locks = this.deferredWriteLocks.get(lockKey) ?? [];
        locks.push(releaseQueueLock);
        this.deferredWriteLocks.set(lockKey, locks);
      } else {
        releaseQueueLock?.();
      }
    }
  }

  /**
   * Trigger a debounced upload after a deferred queueMutation (deferUpload) and
   * its dependent cache write have completed. No-op if no MutationManager.
   */
  protected requestUpload(): void {
    this.mutationManager?.requestUpload();
  }

  // ========================================
  // PUBLIC ACCESSORS
  // ========================================

  /**
   * Get the table name
   */
  public getTableName(): string {
    return this.tableName;
  }

  // ========================================
  // DATABASE INITIALIZATION
  // ========================================

  /**
   * Initialize IndexedDB connection
   * SINGLETON PATTERN: All tables share the same DB instance
   */
  protected async init(): Promise<IDBPDatabase> {
    this.db = await databaseManager.getDatabase(this.tableName);
    return this.db;
  }

  /**
   * Transaction wrapper that tracks active transactions
   */
  protected async runTransaction<R>(
    storeName: string,
    mode: IDBTransactionMode,
    callback: (store: IDBPObjectStore<unknown, [string], string, IDBTransactionMode>) => Promise<R>
  ): Promise<R> {
    const db = await this.init();

    const txPromise = (async () => {
      const tx = db.transaction(storeName, mode);
      const result = await callback(tx.objectStore(storeName));
      await tx.done;
      return result;
    })();

    const voidPromise = txPromise.then(
      () => {},
      () => {}
    ) as Promise<void>;
    trackTransaction(voidPromise);

    return txPromise;
  }

  // ========================================
  // CORE CRUD OPERATIONS
  // ========================================

  /**
   * Get single row by ID
   */
  async get(id: string): Promise<T | null> {
    const row = await this.getReplicatedRow(id);
    if (!row) return null;
    return row.data;
  }

  /**
   * Get the replicated row wrapper for an ID.
   * Used by package-level sync workflows that need cache metadata such as
   * dirty state without relying on app-specific fields.
   */
  async getReplicatedRow(id: string): Promise<ReplicatedRow<T> | null> {
    const row = await this.getReplicatedRowIncludingOtherAccounts(id);
    if (!row) return null;
    const visible = await this.visibleRows();
    return !visible || visible(row as ReplicatedRow<never>) ? row : null;
  }

  /**
   * Whether this table keeps rows per account (MYK9-1133). Such a table stores
   * each row's `ownerAuthUserId` and every reader sees only its own account's
   * rows, so a replica left by one account is invisible to the next. Default
   * off: a table that does not opt in is unchanged.
   */
  usesAccountOwnedRows(): boolean {
    return false;
  }

  /**
   * Which stored rows a reader may return: all of them, or only the signed-in
   * account's. An account that cannot be settled sees none. The ONE place a read
   * is narrowed; every collection reader and `getReplicatedRow` goes through it.
   */
  private async visibleRows(): Promise<RowVisibility | undefined> {
    if (!this.usesAccountOwnedRows()) return undefined;
    const current = await this.getCurrentAuthUserId();
    return row => current !== null && row.ownerAuthUserId === current;
  }

  /**
   * The stored row whoever owns it. For the sync engine and the cache's own
   * bookkeeping only (dirty detection, conflict code): a reader that returned
   * this would hand one account another's rows.
   */
  async getReplicatedRowIncludingOtherAccounts(id: string): Promise<ReplicatedRow<T> | null> {
    const db = await this.init();
    const normalizedId = String(id);
    const key = [this.tableName, normalizedId];

    const row = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, key)) as
      ReplicatedRow<T> | undefined;

    if (!row) {
      this.logger.log(`[${this.tableName}] Cache miss for ID: ${normalizedId}`);
      return null;
    }

    // Update access tracking for LRU+LFU eviction. This is best-effort
    // metadata: a read must never fail (or emit an unhandled rejection)
    // because the access-stats write hit a full storage quota. Swallow any
    // write error and return the row we already read.
    //
    // CRITICAL: read AND write must share a single readwrite transaction and
    // re-read the CURRENT row inside it, then bump ONLY the access-stat fields.
    // The original split-tx version read the row here, then put() the whole
    // stale copy back in a separate auto-commit tx — so a concurrent
    // set(..., isDirty=true) (a score save) committing in between was silently
    // clobbered: dirty flag and new value reverted, and the next pull replaced
    // it with server data. This is the same race PR #351 fixed in
    // markAsSynced/reconcileDirtyRow; getReplicatedRow (the hottest read path,
    // also called at the top of the sync loop) was missed. See the July 2026
    // replication audit finding C3.
    try {
      const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
      const current = (await tx.store.get(key)) as ReplicatedRow<T> | undefined;
      if (current) {
        current.lastAccessedAt = Date.now();
        current.accessCount = (current.accessCount || 0) + 1;
        await tx.store.put(current);
      }
      await tx.done;
    } catch (error) {
      this.logger.warn(
        `[${this.tableName}] Access-tracking write failed for ${normalizedId} (non-fatal):`,
        error
      );
    }

    return row;
  }

  /**
   * Whether a downloaded (clean) row may be stored by {@link batchSet}, which
   * every sync download and row fetch goes through. Checked synchronously in
   * the write's own IndexedDB transaction, just before the put, so a decision
   * made after the server was read (for example: this row's delete was just
   * confirmed) cannot be overtaken by the write. Default: every row.
   */
  protected acceptsRemoteRow(_id: string): boolean {
    return true;
  }

  /**
   * Show-scoped tables override this so `set()` refuses a cold INSERT that the
   * caller did not opt into (MYK9-575). `null` = account-scoped, no guard.
   */
  protected coldInsertGuardMode(): ColdInsertGuardMode | null {
    return null;
  }

  /**
   * Set (upsert) a row in local cache
   *
   * @param incomingServerVersion - The server's `version` column value from the
   *   downloaded row. Only pass for clean (isDirty=false) server writes; dirty
   *   writes preserve the existing serverVersion from the IDB row.
   */
  async set(
    id: string,
    data: T,
    isDirty = false,
    expectedVersion?: number,
    incomingServerVersion?: number,
    options?: ReplicatedSetOptions
  ): Promise<ReplicatedSetResult> {
    const lockKey = String(id);
    const deferredCount = this.deferredMutationRows.get(lockKey) ?? 0;
    const deferred = isDirty && deferredCount > 0;
    if (deferred) {
      if (deferredCount === 1) this.deferredMutationRows.delete(lockKey);
      else this.deferredMutationRows.set(lockKey, deferredCount - 1);
    }
    const deferredLocks = this.deferredWriteLocks.get(lockKey);
    const deferredWriteLock = deferred ? deferredLocks?.shift() : undefined;
    if (deferredLocks && deferredLocks.length === 0) this.deferredWriteLocks.delete(lockKey);
    const releaseWriteLock =
      deferredWriteLock ??
      (isDirty && !deferred ? await this.mutationManager?.acquireMutationWriteLock?.() : undefined);
    // Wrap the write so a storage-quota abort triggers eviction + one retry
    // rather than escaping as an unhandled "AbortError: QuotaExceededError".
    //
    // The cold-insert decision (MYK9-575) belongs to the LOGICAL write, not to
    // each attempt: `relieveQuota()` evicts CLEAN rows, so the retry of a
    // legitimate UPDATE can find its own row gone and would otherwise be
    // refused as an INSERT. `attempt.rowExisted`, recorded inside the first
    // transaction, carries that fact into the retry.
    const attempt: SetAttempt = { rowExisted: false };
    const ownerAuthUserId = await this.rowOwnerFor();
    try {
      const result = await withQuotaEviction(
        () =>
          this.setOnce(
            id,
            data,
            isDirty,
            expectedVersion,
            incomingServerVersion,
            composeRetrySetOptions(options, attempt.rowExisted),
            attempt,
            ownerAuthUserId
          ),
        () => this.relieveQuota(),
        this.logger
      );
      if (isDirty && !deferred && result.written && attempt.revision !== undefined) {
        const revisions = this.pendingWriteRevisions.get(lockKey) ?? [];
        revisions.push(attempt.revision);
        this.pendingWriteRevisions.set(lockKey, revisions);
      }
      if (deferredWriteLock) {
        deferredWriteLock();
      } else if (releaseWriteLock) {
        if (!result.written) {
          // Nothing was stored, so no later markAsSynced will release this lock.
          releaseWriteLock();
        } else {
          const locks = this.pendingWriteLocks.get(lockKey) ?? [];
          locks.push(releaseWriteLock);
          this.pendingWriteLocks.set(lockKey, locks);
        }
      }
      return result;
    } catch (error) {
      releaseWriteLock?.();
      throw error;
    }
  }

  /** The oldest revision recorded for this row's dirty writes, consumed by its queue. */
  private takeWriteRevision(lockKey: string): number | undefined {
    const revisions = this.pendingWriteRevisions.get(lockKey);
    const revision = revisions?.shift();
    if (revisions && revisions.length === 0) this.pendingWriteRevisions.delete(lockKey);
    return revision;
  }

  /** Single attempt of {@link set}; opens its own transaction so it is safe to retry. */
  private async setOnce(
    id: string,
    data: T,
    isDirty: boolean,
    expectedVersion?: number,
    incomingServerVersion?: number,
    options?: ReplicatedSetOptions,
    attempt?: SetAttempt,
    ownerAuthUserId?: string
  ): Promise<ReplicatedSetResult> {
    const db = await this.init();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');

    const normalizedId = String(id);
    const existingRow = (await tx.store.get([this.tableName, normalizedId])) as
      ReplicatedRow<T> | undefined;

    if (existingRow) {
      if (attempt) attempt.rowExisted = true;
    }

    // MYK9-575: a show-scoped table refuses a single-row INSERT unless the
    // caller names its reason. Decided INSIDE this transaction, on the same
    // `existingRow` read the write uses, so no sync landing mid-call can
    // re-open the seeding hole.
    if (
      !existingRow &&
      !isColdInsertAllowed({
        mode: this.coldInsertGuardMode(),
        tableName: this.tableName,
        rowId: normalizedId,
        options,
        logger: this.logger,
      })
    ) {
      await tx.done;
      return { written: false, reason: 'cold-insert-refused' };
    }

    // Optimistic locking - verify version hasn't changed
    if (expectedVersion !== undefined && existingRow && existingRow.version !== expectedVersion) {
      await tx.done;
      throw new Error(
        `[${this.tableName}] Concurrent modification detected for row ${normalizedId}. ` +
          `Expected version ${expectedVersion}, found ${existingRow.version}.`
      );
    }

    // Guard: never overwrite a locally-dirty row with a clean server value.
    // A dirty row has a pending mutation that hasn't been flushed to Supabase yet.
    // Allowing a real-time push (isDirty=false) to clobber it would cause data loss
    // — this is the scoring-sync-bug root cause.
    if (!isDirty && existingRow?.isDirty) {
      await tx.done;
      this.logger.log(
        `[${this.tableName}] Skipped server push for row ${normalizedId} — local mutation pending`
      );
      return { written: false, reason: 'dirty-row-preserved' };
    }

    const row = buildReplicatedRowForSet({
      tableName: this.tableName,
      id: normalizedId,
      data,
      isDirty,
      existingRow,
      incomingServerVersion,
      ownerAuthUserId,
      now: Date.now(),
    });

    await tx.store.put(row);
    await tx.done;
    if (attempt) attempt.revision = row.version;

    this.logger.log(
      `[${this.tableName}] Cached row: ${normalizedId} (version: ${row.version}, dirty: ${isDirty})`
    );

    this.notifyListeners();
    return { written: true };
  }

  /** Returns true when the conflict was written; false if the version changed
   *  under us (row edited concurrently, or `remoteServerVersion` is older than
   *  the row's token: a stale snapshot either way, safe to ignore). */
  async markConflict(
    id: string,
    conflict: ReplicationConflictSnapshot<T>,
    remoteServerVersion?: number
  ): Promise<boolean> {
    const db = await this.init();
    const normalizedId = String(id);
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const existingRow = (await tx.store.get([this.tableName, normalizedId])) as
      ReplicatedRow<T> | undefined;

    const conflictedRow = applyConflictSnapshot(existingRow, conflict, remoteServerVersion);
    if (!conflictedRow) {
      await tx.done;
      return false;
    }

    await tx.store.put(conflictedRow);
    await tx.done;

    this.notifyListeners();
    return true;
  }

  /** Resolve a conflict by keeping the local edit.
   *  Clears the conflict snapshot, resets syncStatus to 'pending', and refreshes
   *  queued mutation OCC state so the local mutation uploads naturally on the
   *  next sync cycle.
   *
   *  @param newServerVersion - The remote row's server version from the conflict
   *    snapshot. Pass this so the next upload uses the correct OCC precondition
   *    (the server has moved to this version) rather than the stale snapshot that
   *    caused the original rejection. */
  async clearConflict(
    id: string,
    newServerVersion?: number,
    options?: {
      mergedData?: T;
      newBaseData?: T;
      rebuildUpdatePayload?: (local: T) => Record<string, unknown>;
    }
  ): Promise<void> {
    const db = await this.init();
    const normalizedId = String(id);
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const existingRow = (await tx.store.get([this.tableName, normalizedId])) as
      ReplicatedRow<T> | undefined;

    const clearedRow = clearConflictSnapshot(existingRow, newServerVersion);
    if (!clearedRow) {
      await tx.done;
      return;
    }

    const nextData = options?.mergedData
      ? ({ ...options.mergedData, id: normalizedId } as T)
      : clearedRow.data;
    const nextRow: ReplicatedRow<T> = {
      ...clearedRow,
      data: nextData,
      ...(options?.newBaseData ? { baseData: options.newBaseData } : {}),
    };
    if (options?.newBaseData) {
      if (newServerVersion === undefined) delete nextRow.baseServerVersion;
      else nextRow.baseServerVersion = newServerVersion;
    }

    await tx.store.put(nextRow);
    await tx.done;

    if (newServerVersion !== undefined) {
      const rebuiltData =
        options?.rebuildUpdatePayload?.(nextRow.data) ?? this.rebuildUpdatePayload(nextRow.data);
      await this.reconcileQueuedMutations(normalizedId, newServerVersion, rebuiltData);
    }

    this.notifyListeners();
  }

  async replaceFromRemote(id: string, remoteData: T, remoteServerVersion?: number): Promise<void> {
    const db = await this.init();
    const normalizedId = String(id);
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const existingRow = (await tx.store.get([this.tableName, normalizedId])) as
      ReplicatedRow<T> | undefined;

    const row = buildRemoteReplacementRow({
      tableName: this.tableName,
      id: normalizedId,
      remoteData,
      existingRow,
      remoteServerVersion,
    });

    await tx.store.put(row);
    await tx.done;
    this.notifyListeners();
  }

  /**
   * Mark a previously-dirty row as synced after the server has confirmed
   * receipt of a locally-applied mutation through a side channel (e.g., a
   * direct submitScore() call that doesn't go through MutationManager).
   *
   * The natural `set(id, data, false)` path would be blocked by the dirty-row
   * guard at line 253 above — that guard exists to stop real-time pushes from
   * clobbering pending local mutations. Here we KNOW the server has the row's
   * current state, so the guard would be wrong; this method bypasses it via
   * a direct IDB put that preserves the existing data and version.
   *
   * No-ops if the row doesn't exist or is already clean (idempotent).
   *
   * @see project_scoring_sync_bug.md — added 2026-05-25 to close the
   *   "online happy-path leaves _syncStatus:'pending' forever" follow-up
   *   from PR #341. Without this, every subsequent replication pull takes
   *   the wasteful mergeDirtyRow branch instead of normal resolveConflict.
   */
  async markAsSynced(id: string): Promise<void> {
    const db = await this.init();
    const normalizedId = String(id);

    // CRITICAL: read AND write must share a single readwrite transaction so a
    // concurrent set(..., true) can't slip a fresh dirty mutation in between
    // our get() and put() and get silently clobbered. The original split-tx
    // version had this race; see PR #351 review finding #1.
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const existingRow = (await tx.store.get([this.tableName, normalizedId])) as
      ReplicatedRow<T> | undefined;

    if (!existingRow || !existingRow.isDirty) {
      // No-op: row absent, or already synced. End the transaction cleanly.
      await tx.done;
      return;
    }

    await tx.store.put(buildSyncedReplicatedRow(existingRow, Date.now()));
    await tx.done;

    this.logger.log(`[${this.tableName}] Marked row ${normalizedId} as synced (was dirty)`);

    this.notifyListeners();
  }

  /**
   * True when the row already holds `version` as its token while a queued UPDATE
   * is still behind it. Checked only then, so an ordinary sync reads no queue.
   */
  private async hasQueuedUpdateBehind(rowId: string, version: number | undefined) {
    if (version === undefined || !this.mutationManager) return false;
    const row = await this.getReplicatedRow(rowId);
    if (!row?.isDirty || row.serverVersion !== version) return false;
    // No signed-in owner to read the queue for: nothing of ours to rebase.
    const queued = await this.mutationManager
      .getPendingMutationsForRow(this.tableName, rowId)
      .catch(() => []);
    return queued.some(
      m => m.operation === 'UPDATE' && m.serverVersion !== undefined && m.serverVersion < version
    );
  }

  private async reconcileQueuedMutations(
    rowId: string,
    serverVersion: number,
    rebuiltData: Record<string, unknown> | undefined
  ): Promise<void> {
    if (!this.mutationManager) return;
    const legacyOmittedKeysServerWins = this.getLegacyOmittedKeysServerWins();
    // Only pass the fifth argument when the adapter names keys (call-shape pins).
    await (legacyOmittedKeysServerWins
      ? this.mutationManager.reconcilePendingMutationsForRow(
          this.tableName,
          rowId,
          serverVersion,
          rebuiltData,
          legacyOmittedKeysServerWins
        )
      : this.mutationManager.reconcilePendingMutationsForRow(
          this.tableName,
          rowId,
          serverVersion,
          rebuiltData
        ));
  }

  /**
   * Reconcile a locally-dirty row against a freshly-synced server snapshot WITHOUT
   * discarding the pending local edit. Used by syncReplicatedTable's dirty branch
   * when there is NO same-field conflict, to fix the root cause of the ringside OCC
   * conflict storm: a dirty row's `serverVersion` token never advanced on sync-down,
   * so every subsequent write carried a stale OCC precondition and 40001'd forever.
   *
   * Two things happen atomically:
   *  1. Server-changed fields the client never touched are merged into the row's
   *     data (3-way merge against `base`), so the next FULL-row write doesn't
   *     regress them to their stale optimistic values (silent data loss). A caller
   *     with a custom merge can pass `mergedData` to override the generic merge.
   *  2. The OCC `serverVersion` token advances forward-only to `remoteServerVersion`,
   *     and the merge base advances to the server snapshot.
   *
   * No-op (returns false, no write) when: the row vanished or went clean under us,
   * the row is in `conflict` state (left for the user to resolve), or nothing would
   * change — neither a field merged nor the token advanced (the Performance guard
   * against per-sync write churn).
   *
   * @returns true if the row was written, false on any no-op path above.
   */
  async reconcileDirtyRow(
    id: string,
    params: {
      base: T;
      remote: T;
      remoteServerVersion: number | undefined;
      /** Pre-merged data from an adapter's mergeDirtyRow; omit for a generic 3-way merge. */
      mergedData?: T;
      /** Fields to take from `remote` over the merged value (MYK9-1104). */
      adoptRemoteFields?: readonly string[];
      /** The local row `version` the conflict check read. Adopting is skipped
       *  (row left dirty for the next pass) if the row has moved since. */
      detectedAtVersion?: number;
      /** Rebuild a full Supabase UPDATE payload from the reconciled row, so a queued
       *  full-row UPDATE can be refreshed (not just the IDB row) and won't clobber. */
      rebuildPayload?: (local: T) => Record<string, unknown>;
    }
  ): Promise<boolean> {
    const db = await this.init();
    const normalizedId = String(id);
    // Read the queue before the tx opens: awaiting it inside would commit the tx.
    const queueBehind = await this.hasQueuedUpdateBehind(normalizedId, params.remoteServerVersion);

    // Single readwrite tx: a concurrent set(..., true) must not slip a fresh dirty
    // mutation between our read and write (same race markAsSynced guards against).
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const existingRow = (await tx.store.get([this.tableName, normalizedId])) as
      ReplicatedRow<T> | undefined;

    // Only reconcile a still-dirty, non-conflicted row, and never from a snapshot
    // older than the row's token (a download may have landed first, MYK9-794).
    if (
      !existingRow ||
      !existingRow.isDirty ||
      existingRow.syncStatus === 'conflict' ||
      isOlderThanRow(existingRow, params.remoteServerVersion)
    ) {
      await tx.done;
      return false;
    }

    // Convergence was judged on a snapshot; a local edit since then (the same
    // revision guard markConflict applies) must not be overwritten by it.
    if (
      params.adoptRemoteFields?.length &&
      params.detectedAtVersion !== undefined &&
      existingRow.version !== params.detectedAtVersion
    ) {
      await tx.done;
      return false;
    }

    const mergedData =
      params.mergedData ??
      mergeNonConflictingServerFields({
        base: params.base,
        local: existingRow.data,
        remote: params.remote,
        instantFields: instantFieldsFor(this.tableName),
      }).merged;
    const normalizedMerged = { ...mergedData, id: normalizedId } as T;
    for (const field of params.adoptRemoteFields ?? []) {
      (normalizedMerged as Record<string, unknown>)[field] = (
        params.remote as Record<string, unknown>
      )[field];
    }

    // Forward-only token advance: never pull the token back on a late/backdated row.
    const advanceToken =
      params.remoteServerVersion !== undefined &&
      params.remoteServerVersion > (existingRow.serverVersion ?? -Infinity);
    const nextServerVersion = advanceToken ? params.remoteServerVersion : existingRow.serverVersion;

    // The row may already hold the server's token while a queued write is still
    // behind it: an OCC rejection advances the row only (MYK9-771). The caller
    // found no same-field conflict against this remote, so rebase that write too.
    const rebaseQueue =
      advanceToken || (queueBehind && params.remoteServerVersion === existingRow.serverVersion);

    // Churn guard: skip the IDB write when neither the data nor the token changed.
    const dataChanged = JSON.stringify(normalizedMerged) !== JSON.stringify(existingRow.data);
    if (!rebaseQueue && !dataChanged) {
      await tx.done;
      return false;
    }

    const row = buildReconciledDirtyRow({
      existingRow,
      mergedData: normalizedMerged,
      newBaseData: params.remote,
      baseServerVersion: params.remoteServerVersion,
      serverVersion: nextServerVersion,
      now: Date.now(),
    });

    await tx.store.put(row);
    await tx.done;

    // The upload reads serverVersion/data from the QUEUED mutation, not this row —
    // so reconcile the queue too, or the stuck mutation keeps uploading the stale
    // token forever (storm) and, for full-row UPDATEs, the stale payload (clobber).
    if (rebaseQueue && params.remoteServerVersion !== undefined) {
      const rebuiltData = params.rebuildPayload?.(normalizedMerged);
      await this.reconcileQueuedMutations(normalizedId, params.remoteServerVersion, rebuiltData);
    }

    this.logger.log(
      `[${this.tableName}] Reconciled dirty row ${normalizedId} ` +
        `(serverVersion: ${nextServerVersion}, merged: ${dataChanged})`
    );

    this.notifyListeners();
    return true;
  }

  /**
   * Delete a row from local cache
   */
  async delete(id: string): Promise<void> {
    const db = await this.init();
    const normalizedId = String(id);
    await db.delete(REPLICATION_STORES.REPLICATED_TABLES, [this.tableName, normalizedId]);
    this.logger.log(`[${this.tableName}] Deleted row: ${normalizedId}`);

    this.notifyListeners();
  }

  /**
   * Return the persisted conflict snapshots for every row in this table that is
   * currently in `syncStatus: 'conflict'`.  Used by the app shell on provider
   * mount to re-surface conflicts the user navigated away from before resolving,
   * so the Sonner resolution toast reappears on next visit rather than silently
   * disappearing.
   */
  async getConflictedRows(): Promise<ReplicationConflictSnapshot<T>[]> {
    // The account is settled BEFORE the transaction opens: a lookup awaited
    // inside it lets the transaction auto-commit (TransactionInactiveError).
    const visible = await this.visibleRows();
    const db = await this.init();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
    const index = tx.store.index('tableName');
    const rows = ((await index.getAll(this.tableName)) as ReplicatedRow<T>[]).filter(
      row => !visible || visible(row as ReplicatedRow<never>)
    );
    return getConflictSnapshots(rows);
  }

  /**
   * Resolve a persisted conflict in one call, reading all required params from
   * the stored conflict snapshot so callers only need the rowId + choice.
   *
   * - 'keep-local': clears the conflict, resets syncStatus → 'pending'.  The
   *   existing local mutation re-uploads with an updated OCC precondition.
   * - 'take-remote': replaces local data with the remote version, marks the row
   *   synced.  Callers should also call
   *   `mutationManager.discardPendingMutationsForRow` to drop any queued upload.
   *
   * Returns false and is a no-op when the row has no persisted conflict snapshot
   * (e.g. already resolved or row doesn't exist).
   */
  async resolveReplicationConflict(
    id: string,
    resolution: ReplicationConflictResolution,
    options?: { rebuildUpdatePayload?: (local: T) => Record<string, unknown> }
  ): Promise<boolean> {
    const row = await this.getReplicatedRow(id);
    const snapshot = row?.conflict;
    if (!snapshot) return false;

    if (resolution === 'keep-local') {
      const merged = mergeNonConflictingServerFields({
        base: snapshot.baseData,
        local: row.data,
        remote: snapshot.remoteData,
        instantFields: instantFieldsFor(this.tableName),
      }).merged;
      await this.clearConflict(id, snapshot.remoteServerVersion, {
        mergedData: merged,
        newBaseData: snapshot.remoteData,
        rebuildUpdatePayload: options?.rebuildUpdatePayload,
      });
    } else {
      await this.replaceFromRemote(id, snapshot.remoteData, snapshot.remoteServerVersion);
    }
    return true;
  }

  /**
   * How this table's rows leave a collection read. Every collection reader
   * (getAll, getAllWithStatus, getByShowWithStatus) applies it, so a table
   * that must strip fields from its cached rows says so once here and no new
   * reader can bypass it (MYK9-788: the show read skipped the judge-assignment
   * redaction that lived in a getAllWithStatus override). `get()` stays raw.
   */
  protected presentRows(rows: T[]): T[] {
    return rows;
  }

  private presentResult(result: ReplicatedReadResult<T>): ReplicatedReadResult<T> {
    return result.ok ? { ...result, rows: this.presentRows(result.rows) } : result;
  }

  /**
   * Get all rows for this table
   */
  async getAll(licenseKey?: string): Promise<T[]> {
    return this.presentRows(await this.queryManager.getAll(licenseKey, await this.visibleRows()));
  }

  /**
   * Get all rows with explicit local-read status. Use this when an empty result
   * would drive a user-visible or operational claim.
   */
  async getAllWithStatus(licenseKey?: string): Promise<ReplicatedReadResult<T>> {
    return this.presentResult(
      await this.queryManager.getAllWithStatus(licenseKey, await this.visibleRows())
    );
  }

  /**
   * One show's rows (by the mapped row's `showId`) with explicit local-read
   * status, read through the show index instead of a whole-table scan
   * (MYK9-788).
   */
  async getByShowWithStatus(showId: string): Promise<ReplicatedReadResult<T>> {
    return this.presentResult(
      await this.queryManager.getByShowWithStatus(showId, await this.visibleRows())
    );
  }

  /**
   * Get all rows, or throw when the device could not read them. getAll() hands
   * back [] for a failed read, which a caller then reports or acts on as "there
   * are none". Scoped readers built on this throw instead, so a failed read
   * reaches the caller's error state, fallback or aborted write.
   */
  async getAllOrThrow(licenseKey?: string): Promise<T[]> {
    return this.rowsOrThrow(await this.getAllWithStatus(licenseKey));
  }

  /**
   * Every row whoever owns it, or throw when the device could not read them.
   * For the sync engine's emptiness proof only: a reader would hand one
   * account another's rows.
   */
  async getAllOrThrowIncludingOtherAccounts(licenseKey?: string): Promise<T[]> {
    return this.rowsOrThrow(
      this.presentResult(await this.queryManager.getAllWithStatus(licenseKey))
    );
  }

  /**
   * One show's rows through the show index (getByShowWithStatus), or throw
   * exactly as getAllOrThrow does when the device could not read them
   * (MYK9-792). A show-scoped reader uses this instead of filtering a
   * whole-table read, which scans every show held on the device.
   */
  async getByShowOrThrow(showId: string): Promise<T[]> {
    return this.rowsOrThrow(await this.getByShowWithStatus(showId));
  }

  private rowsOrThrow(result: ReplicatedReadResult<T>): T[] {
    if (!result.ok) {
      // Plain words for any screen that shows it; the table and the storage
      // error ride along as the cause for logging.
      // Named so a caller's server fallback can tell "the device could not read"
      // from any other throw (it must not serve server rows over writes this
      // device has not uploaded).
      throw Object.assign(new Error("This device couldn't read its saved show data. Try again."), {
        name: 'ReplicaReadError',
        cause: { table: this.tableName, error: result.error },
      });
    }
    return result.rows;
  }

  /**
   * Optimistic update with automatic retry on version conflicts
   *
   * Note: this has no production callers today, so its `written: false` branch
   * (MYK9-575) is exercised only by tests.
   */
  async optimisticUpdate(
    id: string,
    updateFn: (current: T) => T | Promise<T>,
    _maxRetries = MAX_OPTIMISTIC_UPDATE_RETRIES
  ): Promise<T> {
    return this.rowLocks.withRowLock(id, async () => {
      const db = await this.init();
      const existingRow = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, [
        this.tableName,
        id,
      ])) as ReplicatedRow<T> | undefined;

      if (!existingRow) {
        throw new Error(`[${this.tableName}] Row ${id} not found for optimistic update`);
      }

      const currentVersion = existingRow.version;
      const currentData = existingRow.data;

      const updatedData = await updateFn(currentData);
      const result = await this.set(id, updatedData, true, currentVersion);
      if (!result.written) {
        // The pre-check above proves the row existed, so this is an anomaly —
        // report what the store actually holds rather than the value we failed
        // to write (MYK9-575).
        this.logger.warn(
          `[${this.tableName}] Optimistic update for ${id} stored nothing (${result.reason})`
        );
        return currentData;
      }

      this.logger.log(`[${this.tableName}] Optimistic update succeeded for ${id}`);
      return updatedData;
    });
  }

  // ========================================
  // DELEGATED METHODS (to extracted managers)
  // ========================================

  // --- Batch Operations ---

  /**
   * Downloaded (clean) rows. On an account-owned table they are written as the
   * `ownerAuthUserId` account: the sync passes the account it captured before
   * its fetch; any other caller writes as the signed-in account.
   */
  async batchSet(
    items: T[],
    serverVersions?: Map<string, number>,
    ownerAuthUserId?: string
  ): Promise<void> {
    return this.batchManager.batchSet(
      items,
      serverVersions,
      await this.rowOwnerFor(ownerAuthUserId)
    );
  }

  async batchSetChunked(
    items: T[],
    chunkSize?: number,
    serverVersions?: Map<string, number>,
    ownerAuthUserId?: string
  ): Promise<void> {
    return this.batchManager.batchSetChunked(
      items,
      chunkSize,
      serverVersions,
      await this.rowOwnerFor(ownerAuthUserId)
    );
  }

  /** The owner a write stamps on its rows: undefined on a table that keeps no owners. */
  private async rowOwnerFor(explicit?: string): Promise<string | undefined> {
    if (!this.usesAccountOwnedRows()) return undefined;
    return explicit ?? (await this.getCurrentAuthUserId()) ?? undefined;
  }

  async batchDelete(ids: string[]): Promise<void> {
    return this.batchManager.batchDelete(ids);
  }

  /**
   * Atomically delete the rows with no unsynced local work (dirty, `_localOnly`,
   * pending or failed mutation); the check and delete share one IndexedDB
   * transaction, so another tab cannot dirty a row in between (MYK9-922).
   */
  async deleteRowsIfClean(
    ids: Iterable<string>,
    remoteVersions?: ReadonlyMap<string, number>
  ): Promise<{ deleted: string[]; kept: string[] }> {
    return this.batchManager.deleteRowsIfClean(ids, remoteVersions);
  }

  /** One-time repair for rows stuck at a `'pending'` data flag (MYK9-1055). */
  async repairStuckPendingFlags<TRemote>(
    adapter: StuckRepairAdapter<TRemote, T>
  ): Promise<RepairStuckPendingFlagsResult> {
    return this.batchManager.repairStuckPendingFlags(adapter);
  }

  async clearCache(): Promise<void> {
    await this.batchManager.clearCache();

    // Also reset sync metadata so next sync does a full fetch. `scopes: {}` clears
    // every per-scope watermark too, so a scoped sync after clearCache re-fetches
    // from epoch rather than reading a stale scoped watermark.
    await this.cacheManager.updateSyncMetadata(
      {
        lastFullSyncAt: 0,
        lastIncrementalSyncAt: 0,
        totalRows: 0,
        syncStatus: 'idle',
        errorMessage: undefined,
        scopes: {},
      },
      { scopeSyncedBy: null }
    );
    this.logger.log(`[${this.tableName}] Sync metadata reset`);
  }

  // --- Cache Management ---

  subscribe(
    callback: (data: T[]) => void,
    options?: ReplicatedTableSubscriptionOptions
  ): () => void {
    return this.cacheManager.subscribe(callback, options);
  }

  protected async notifyListeners(): Promise<void> {
    return this.cacheManager.notifyListeners();
  }

  /**
   * Hand rows to another owner (MYK9-1205: a fresh passcode session adopting the
   * held scores of a dead one). Only a row currently owned by `from` moves; its
   * data, version, dirty flag, sync status and conflict snapshot are kept as they
   * are. Idempotent: a row already moved is no longer `from`'s. Notifies
   * subscribers like every other write, so a mounted list shows the rows at once.
   * @returns the conflict snapshots of the rows that moved, plus those of rows
   * already owned by `to` (a resumed adoption).
   */
  async transferRowOwnership(
    ids: readonly string[],
    from: string,
    to: string
  ): Promise<ReplicationConflictSnapshot<T>[]> {
    const db = await this.init();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const moved: ReplicationConflictSnapshot<T>[] = [];
    let movedRows = 0;
    for (const id of new Set(ids.map(String))) {
      const row = (await tx.store.get([this.tableName, id])) as ReplicatedRow<T> | undefined;
      // A row already `to`'s with a conflict is a half-finished adoption (the
      // queue step failed after this one): hand its snapshot back so the retry
      // re-surfaces it instead of leaving uploads conflict-blocked and silent.
      if (row?.ownerAuthUserId === to && row.conflict) moved.push(row.conflict);
      if (!row || row.ownerAuthUserId !== from) continue;
      await tx.store.put({ ...row, ownerAuthUserId: to });
      movedRows++;
      if (row.conflict) moved.push(row.conflict);
    }
    await tx.done;
    if (movedRows > 0) await this.notifyListeners();
    return moved;
  }

  async estimateTotalSize(): Promise<number> {
    return this.cacheManager.estimateTotalSize();
  }

  async getCacheStats(): Promise<CacheStats> {
    return this.cacheManager.getCacheStats();
  }

  async evictLRU(targetSizeBytes: number): Promise<number> {
    return this.cacheManager.evictLRU(targetSizeBytes);
  }

  /**
   * Free local cache space in response to storage-quota pressure by evicting
   * the oldest/least-used ~30% of this table's footprint. Dirty/unsynced and
   * recently-touched rows are always protected (see {@link evictLRU}), so this
   * never drops pending offline mutations. Returns the number of rows evicted.
   *
   * SCOPE: per-table. All replicated tables share one IndexedDB object store
   * and the browser quota is global, so this reclaims space within the table
   * whose write overflowed — the common case, since bulk sync overflows on the
   * large table that grew. A genuine cross-table overflow (this table has no
   * evictable rows while another holds gigabytes of garbage) won't recover
   * here; that would need a store-wide evictor — tracked as a follow-up.
   */
  async relieveQuota(): Promise<number> {
    return this.cacheManager.evictRetainingFraction(QUOTA_EVICTION_RETAIN_FRACTION);
  }

  async getSyncMetadata(scopeValue?: string): Promise<SyncMetadata | null> {
    return this.cacheManager.getSyncMetadata(scopeValue);
  }

  /**
   * {@link getSyncMetadata} that throws when the read fails or times out instead
   * of answering null, so a caller can tell "never synced" from "could not
   * tell" (MYK9-1133).
   */
  async getSyncMetadataOrThrow(scopeValue?: string): Promise<SyncMetadata | null> {
    return this.cacheManager.getSyncMetadataOrThrow(scopeValue);
  }

  async updateSyncMetadata(
    updates: Partial<SyncMetadata>,
    options?: {
      scopeValue?: string;
      advanceWatermarkMonotonically?: boolean;
      scopeSyncedBy?: string | null | ScopeStampDirective;
    }
  ): Promise<void> {
    return this.cacheManager.updateSyncMetadata(updates, options);
  }

  /**
   * The signed-in auth user, from the same source the mutation queue stamps its
   * owner with. Null when it cannot be settled (no manager wired, no session, or
   * an expired session that cannot refresh offline): callers treat null as its
   * own state, never as a match and never as "no rows" (MYK9-1133).
   */
  async getCurrentAuthUserId(): Promise<string | null> {
    return this.mutationManager ? this.mutationManager.resolveCurrentUserId() : null;
  }

  // ========================================
  // STALE ENTRY DETECTION
  // ========================================

  async getAllLocalIds(): Promise<Set<string>> {
    return this.queryManager.getAllLocalIds(await this.visibleRows());
  }

  async removeStaleEntries(
    serverIds: Set<string>,
    options: { syncedBefore?: number } = {}
  ): Promise<number> {
    // Only the syncing account's own rows are ever stale to it: another
    // account's cache must survive this account's sync (MYK9-1133). Settled
    // before the transaction opens, never inside it.
    const visible = await this.visibleRows();
    const db = await this.init();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const index = tx.store.index('tableName');
    const rows = ((await index.getAll(this.tableName)) as ReplicatedRow<T>[]).filter(
      row => !visible || visible(row as ReplicatedRow<never>)
    );

    let removedCount = 0;

    for (const row of rows.filter(row => row.isDirty)) {
      this.logger.log(`[${this.tableName}] Preserving dirty row ${row.id}`);
    }

    for (const row of selectStaleCleanRows(rows, serverIds, options)) {
      await tx.store.delete([row.tableName, row.id]);
      removedCount++;
      this.logger.log(`[${this.tableName}] Removed stale entry: ${row.id}`);
    }

    await tx.done;

    if (removedCount > 0) {
      this.logger.log(`[${this.tableName}] Removed ${removedCount} stale entries`);
      this.notifyListeners();
    }

    return removedCount;
  }

  // ========================================
  // ABSTRACT METHODS (to be implemented by subclasses)
  // ========================================

  /**
   * Sync with server (to be implemented by subclasses)
   */
  abstract sync(licenseKey: string, options?: Partial<SyncOptions>): Promise<SyncResult>;

  /**
   * Resolve conflicts (to be implemented by subclasses)
   */
  protected abstract resolveConflict(local: T, remote: T): T;
}

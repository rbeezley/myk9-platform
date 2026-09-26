import { unwrap, type IDBPDatabase } from 'idb';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import { withQuotaEviction } from './quota-eviction';
import { type PendingMutation, type ReplicatedRow } from './types';

export class MutationQueueStore {
  // Monotonic sequence for deterministic upload ordering. Seeded once from the
  // persisted counter + the max sequence already in the stores (survives
  // reload), then incremented synchronously per queue so same-millisecond edits
  // to a row never reorder. See mutation-ordering.compareMutationOrder.
  private sequenceCounter: number | null = null;
  private sequenceSeedPromise: Promise<void> | null = null;

  /** Reserved SYNC_METADATA key (store is keyed by `tableName`) for the counter. */
  private static readonly SEQUENCE_METADATA_KEY = '__mutation_sequence__';

  constructor(private readonly logger: Logger) {}

  /**
   * Return the next monotonic sequence number, seeding the in-memory counter on
   * first use from the persisted value AND the max sequence already present in
   * the pending/failed stores (whichever is higher), so it survives a reload or
   * a metadata loss. The increment is synchronous once seeded, so concurrent
   * queueMutation calls in the same tab always get distinct, increasing values.
   */
  private async nextSequenceNumber(db: IDBPDatabase): Promise<number> {
    if (this.sequenceCounter === null) {
      if (!this.sequenceSeedPromise) {
        this.sequenceSeedPromise = (async () => {
          let seed = 0;
          try {
            const rec = (await db.get(
              REPLICATION_STORES.SYNC_METADATA,
              MutationQueueStore.SEQUENCE_METADATA_KEY
            )) as { value?: number } | undefined;
            if (rec && typeof rec.value === 'number') seed = rec.value;
          } catch {
            /* metadata missing — fall back to store scan */
          }
          try {
            const [pending, failed] = await Promise.all([
              db.getAll(REPLICATION_STORES.PENDING_MUTATIONS) as Promise<PendingMutation[]>,
              db.getAll(REPLICATION_STORES.FAILED_MUTATIONS) as Promise<PendingMutation[]>,
            ]);
            for (const m of [...pending, ...failed]) {
              if (typeof m.sequenceNumber === 'number' && m.sequenceNumber > seed) {
                seed = m.sequenceNumber;
              }
            }
          } catch {
            /* store scan best-effort */
          }
          this.sequenceCounter = seed;
        })();
      }
      await this.sequenceSeedPromise;
    }

    // Synchronous increment — no await between read and write of the counter.
    const next = (this.sequenceCounter as number) + 1;
    this.sequenceCounter = next;

    // Persist opportunistically so a reload re-seeds correctly; best-effort
    // because the in-store max is a sufficient fallback if this write is lost.
    try {
      await db.put(REPLICATION_STORES.SYNC_METADATA, {
        tableName: MutationQueueStore.SEQUENCE_METADATA_KEY,
        value: next,
      });
    } catch {
      /* non-fatal */
    }

    return next;
  }

  /**
   * Free space by deleting the least-recently-accessed CLEAN cache rows from the
   * replicated-tables store. Used as the eviction callback when a mutation write
   * hits storage quota. Dirty/unsynced rows are never deleted, so an offline
   * score can make room without losing other unsynced data. Best-effort:
   * returns 0 (write cannot proceed) if nothing clean is evictable or the scan
   * fails.
   */
  private async evictCleanCacheRows(db: IDBPDatabase): Promise<number> {
    try {
      const all = (await db.getAll(
        REPLICATION_STORES.REPLICATED_TABLES
      )) as ReplicatedRow<unknown>[];
      const clean = all
        .filter(row => !row.isDirty)
        .sort((a, b) => (a.lastAccessedAt ?? 0) - (b.lastAccessedAt ?? 0));
      if (clean.length === 0) return 0;

      // Free ~10% of clean rows (at least one) — enough to relieve pressure
      // without nuking the whole cache. Key is [tableName, id] (top-level).
      const toEvict = Math.max(1, Math.floor(clean.length * 0.1));
      const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
      let evicted = 0;
      for (let i = 0; i < toEvict && i < clean.length; i++) {
        const row = clean[i];
        if (row && typeof row.tableName === 'string' && typeof row.id === 'string') {
          await tx.store.delete([row.tableName, row.id]);
          evicted++;
        }
      }
      await tx.done;
      return evicted;
    } catch {
      return 0;
    }
  }

  async queueMutation(
    tableName: string,
    operation: PendingMutation['operation'],
    rowId: string,
    data: Record<string, unknown>,
    authUserId: string,
    dependsOn?: string[],
    serverVersion?: number,
    rpc?: PendingMutation['rpc']
  ): Promise<string> {
    const db = await databaseManager.getDatabase('MutationManager');
    const sequenceNumber = await this.nextSequenceNumber(db);
    const id = crypto.randomUUID();
    const mutation: PendingMutation = {
      id,
      authUserId,
      tableName,
      operation,
      rowId,
      data,
      explicitDataKeys: Object.keys(data),
      timestamp: Date.now(),
      sequenceNumber,
      retries: 0,
      status: 'pending',
      dependsOn,
      ...(serverVersion !== undefined && { serverVersion }),
      ...(rpc !== undefined && { rpc }),
    };
    // Wrap the durable queue write so storage-quota pressure evicts CLEAN cache
    // rows and retries once, rather than throwing raw QuotaExceededError and
    // dropping the score (audit M2). Dirty/unsynced rows and other mutations are
    // never touched by the evictor.
    await withQuotaEviction(
      () => putStampingCurrentServerVersion(db, mutation),
      () => this.evictCleanCacheRows(db),
      this.logger
    );
    this.logger.log(`[MutationManager] Queued ${operation} for ${tableName}/${rowId}`);
    return id;
  }

  async getPendingCount(): Promise<number> {
    const db = await databaseManager.getDatabase('MutationManager');
    return db.count(REPLICATION_STORES.PENDING_MUTATIONS);
  }

  async getPendingMutationsForRow(
    tableName: string,
    rowId: string,
    authUserId: string
  ): Promise<PendingMutation[]> {
    const db = await databaseManager.getDatabase('MutationManager');
    const all = (await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[];

    return all
      .filter(
        mutation =>
          mutation.tableName === tableName &&
          mutation.rowId === rowId &&
          mutation.authUserId === authUserId
      )
      .sort((a, b) => {
        const sequenceA = a.sequenceNumber ?? Number.MAX_SAFE_INTEGER;
        const sequenceB = b.sequenceNumber ?? Number.MAX_SAFE_INTEGER;
        if (sequenceA !== sequenceB) return sequenceA - sequenceB;
        if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
        return a.id.localeCompare(b.id);
      });
  }

  async getFailedMutations(authUserId: string): Promise<PendingMutation[]> {
    const db = await databaseManager.getDatabase('MutationManager');
    const failed = (await db.getAll(REPLICATION_STORES.FAILED_MUTATIONS)) as PendingMutation[];
    return failed.filter(mutation => mutation.authUserId === authUserId);
  }

  async retryFailedMutation(
    mutationId: string,
    authUserId: string,
    confirmOwner: () => Promise<void>
  ): Promise<PendingMutation | undefined> {
    const db = await databaseManager.getDatabase('MutationManager');
    const failed = (await db.get(REPLICATION_STORES.FAILED_MUTATIONS, mutationId)) as
      PendingMutation | undefined;
    if (!failed || failed.authUserId !== authUserId) return undefined;

    const requeued: PendingMutation = {
      ...failed,
      status: 'pending',
      retries: 0,
      // A user-driven retry grants a fresh set of OCC attempts too — without
      // this, a mutation parked at the occ lifetime cap would re-park on its
      // very next conflict.
      occRetries: 0,
    };
    delete requeued.error;
    delete requeued.failureKind;
    delete requeued.nextRetryAt;
    delete requeued.failedAt;

    await confirmOwner();
    const tx = db.transaction(
      [REPLICATION_STORES.PENDING_MUTATIONS, REPLICATION_STORES.FAILED_MUTATIONS],
      'readwrite'
    );
    await Promise.all([
      tx.objectStore(REPLICATION_STORES.PENDING_MUTATIONS).put(requeued),
      tx.objectStore(REPLICATION_STORES.FAILED_MUTATIONS).delete(mutationId),
      tx.done,
    ]);
    this.logger.log(
      `[MutationManager] Re-queued failed mutation ${mutationId} (${failed.tableName}/${failed.rowId})`
    );
    return failed;
  }

  async discardFailedMutation(
    mutationId: string,
    authUserId: string,
    confirmOwner: () => Promise<void>
  ): Promise<boolean> {
    const db = await databaseManager.getDatabase('MutationManager');
    const failed = (await db.get(REPLICATION_STORES.FAILED_MUTATIONS, mutationId)) as
      PendingMutation | undefined;
    if (!failed || failed.authUserId !== authUserId) return false;
    await confirmOwner();
    await db.delete(REPLICATION_STORES.FAILED_MUTATIONS, mutationId);
    return true;
  }

  async discardPendingMutationsForRow(
    tableName: string,
    rowId: string,
    authUserId: string,
    confirmOwner: () => Promise<void>
  ): Promise<number> {
    const db = await databaseManager.getDatabase('MutationManager');
    const all = await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
    const toDelete = all
      .filter(m => m.tableName === tableName && m.rowId === rowId && m.authUserId === authUserId)
      .map(m => m.id);

    if (toDelete.length === 0) return 0;

    await confirmOwner();
    const tx = db.transaction(REPLICATION_STORES.PENDING_MUTATIONS, 'readwrite');
    for (const id of toDelete) {
      await tx.store.delete(id);
    }
    await tx.done;
    this.logger.log(
      `[MutationManager] Discarded ${toDelete.length} mutation(s) for ${tableName}/${rowId} (conflict resolved: take remote)`
    );
    return toDelete.length;
  }

  async updateMutationServerVersions(
    tableName: string,
    rowId: string,
    newServerVersion: number,
    authUserId: string,
    confirmOwner?: () => Promise<void>
  ): Promise<number> {
    const db = await databaseManager.getDatabase('MutationManager');
    const all = await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
    const toUpdate = all.filter(
      m => m.tableName === tableName && m.rowId === rowId && m.authUserId === authUserId
    );

    if (toUpdate.length === 0) return 0;

    await confirmOwner?.();
    const tx = db.transaction(REPLICATION_STORES.PENDING_MUTATIONS, 'readwrite');
    for (const mutation of toUpdate) {
      await tx.store.put({ ...mutation, serverVersion: newServerVersion });
    }
    await tx.done;
    this.logger.log(
      `[MutationManager] Updated serverVersion → ${newServerVersion} for ${toUpdate.length} mutation(s) on ${tableName}/${rowId}`
    );
    return toUpdate.length;
  }

  async reconcilePendingMutationsForRow(
    tableName: string,
    rowId: string,
    newServerVersion: number,
    authUserId: string,
    rebuiltData?: Record<string, unknown>,
    legacyOmittedKeysServerWins: readonly string[] = [],
    confirmOwner?: () => Promise<void>
  ): Promise<number> {
    const db = await databaseManager.getDatabase('MutationManager');
    const all = await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
    const candidates = all.filter(
      m =>
        m.tableName === tableName &&
        m.rowId === rowId &&
        m.operation === 'UPDATE' &&
        m.authUserId === authUserId
    );
    if (candidates.length === 0) return 0;

    await confirmOwner?.();
    const tx = db.transaction(REPLICATION_STORES.PENDING_MUTATIONS, 'readwrite');
    let changed = 0;
    for (const mutation of candidates) {
      const isRpc = mutation.rpc !== undefined;
      // A full-row UPDATE can only be advanced if we can also refresh its payload;
      // otherwise advancing the token would trade a 40001 for a silent clobber.
      if (!isRpc && rebuiltData === undefined) continue;

      const nextServerVersion =
        mutation.serverVersion === undefined || newServerVersion > mutation.serverVersion
          ? newServerVersion
          : mutation.serverVersion;

      const explicitDataKeys =
        mutation.explicitDataKeys ??
        Object.keys(mutation.data).filter(key => !legacyOmittedKeysServerWins.includes(key));
      const reconciledData =
        !isRpc && rebuiltData !== undefined ? { ...rebuiltData } : mutation.data;

      if (!isRpc && rebuiltData !== undefined) {
        for (const key of explicitDataKeys) {
          if (
            !(key in reconciledData) &&
            Object.prototype.hasOwnProperty.call(mutation.data, key)
          ) {
            reconciledData[key] = mutation.data[key];
          }
        }
      }

      const next: PendingMutation = {
        ...mutation,
        serverVersion: nextServerVersion,
        explicitDataKeys,
        ...(!isRpc && rebuiltData !== undefined ? { data: reconciledData } : {}),
      };
      await tx.store.put(next);
      changed++;
    }
    await tx.done;

    if (changed > 0) {
      this.logger.log(
        `[MutationManager] Reconciled ${changed} queued mutation(s) for ${tableName}/${rowId} ` +
          `→ serverVersion ${newServerVersion}`
      );
    }
    return changed;
  }

  async clearMutationsForOwner(
    authUserId: string,
    confirmOwner: () => Promise<void>
  ): Promise<void> {
    const db = await databaseManager.getDatabase('MutationManager');
    const pending = (await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).filter(
      mutation => mutation.authUserId === authUserId
    );
    const failed = (await db.getAll(REPLICATION_STORES.FAILED_MUTATIONS)).filter(
      mutation => mutation.authUserId === authUserId
    );
    await confirmOwner();
    const tx = db.transaction(
      [REPLICATION_STORES.PENDING_MUTATIONS, REPLICATION_STORES.FAILED_MUTATIONS],
      'readwrite'
    );
    await Promise.all([
      ...pending.map(mutation =>
        tx.objectStore(REPLICATION_STORES.PENDING_MUTATIONS).delete(mutation.id)
      ),
      ...failed.map(mutation =>
        tx.objectStore(REPLICATION_STORES.FAILED_MUTATIONS).delete(mutation.id)
      ),
      tx.done,
    ]);
  }
}

/**
 * Persist a queued mutation, moving its OCC token forward past THIS device's
 * own upload that landed while the caller was queuing it (MYK9-770).
 *
 * The caller (ReplicatedTable.queueMutation) reads `row.serverVersion` before
 * calling in. If this device's previous write to the row uploads in between,
 * the upload marks the row with the new version and re-stamps the row's queued
 * mutations (updateMutationServerVersions) — before this one is in the queue.
 * It would then carry the stale token forever: every upload matches 0 rows and
 * a full-row UPDATE is never rebased (MYK9-771).
 *
 * Only that step is taken: the token moves from `from` to `to` exactly when
 * the row's `lastOwnUpload` says this device's own upload moved it so and the
 * row still holds `to`. The payload was built on the local row, which already
 * held that upload's change, so it is based on `to`. Any other advance — a
 * download carrying another device's write — leaves the token alone, so that
 * conflict still surfaces instead of being overwritten (Codex P1).
 *
 * The read and the put share ONE readwrite transaction over both stores, which
 * IndexedDB orders wholly before or after the upload's row write; either order
 * leaves this mutation on the current token.
 */
async function putStampingCurrentServerVersion(
  db: IDBPDatabase,
  mutation: PendingMutation
): Promise<void> {
  if (mutation.operation !== 'UPDATE' || mutation.serverVersion === undefined) {
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
    return;
  }
  const requestedVersion = mutation.serverVersion;
  // Raw IndexedDB, with the put issued from the read's own success callback:
  // that is the one place the transaction is guaranteed active. Resuming after
  // an awaited promise is not (under fake timers the transaction had already
  // committed), and a put that lands in a second transaction reopens the gap.
  const tx = (unwrap(db) as IDBDatabase).transaction(
    [REPLICATION_STORES.REPLICATED_TABLES, REPLICATION_STORES.PENDING_MUTATIONS],
    'readwrite'
  );
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Queue transaction aborted'));
    const read = tx
      .objectStore(REPLICATION_STORES.REPLICATED_TABLES)
      .get([mutation.tableName, String(mutation.rowId)]);
    read.onsuccess = () => {
      const row = read.result as ReplicatedRow<unknown> | undefined;
      const step = row?.lastOwnUpload;
      const stamped =
        step !== undefined && step.from === requestedVersion && row?.serverVersion === step.to
          ? { ...mutation, serverVersion: step.to }
          : mutation;
      tx.objectStore(REPLICATION_STORES.PENDING_MUTATIONS).put(stamped);
    };
  });
}

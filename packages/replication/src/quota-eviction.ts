/**
 * Storage-quota recovery for IndexedDB writes.
 *
 * When the browser's persistent-storage quota is exhausted, an IndexedDB
 * write transaction aborts. The `idb` library surfaces the aborted transaction
 * via a rejected `tx.done` promise, and Chromium reports it as a `DOMException`
 * whose name is `AbortError` and whose message is `QuotaExceededError` — i.e.
 * the "AbortError: QuotaExceededError" seen in production telemetry.
 *
 * The replication cache already has working LRU/LFU eviction
 * (`ReplicatedTableCache.evictLRU`) that protects dirty/unsynced rows, but
 * nothing ever triggered it. These helpers wire eviction to the moment quota
 * pressure actually manifests: a failed write.
 */
import type { IDBPDatabase } from 'idb';
import { REPLICATION_STORES } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import type { ReplicatedRow } from './types';

/**
 * Detect a storage-quota-exhausted error across browser quirks.
 *
 * - Chromium/standard: `DOMException` with `name === 'QuotaExceededError'`.
 * - `idb` aborted transaction: `name === 'AbortError'` with the quota error in
 *   the message ("QuotaExceededError").
 * - Legacy Firefox numeric codes: `1014` (NS_ERROR_DOM_QUOTA_REACHED) and the
 *   generic `22` (QUOTA_EXCEEDED_ERR).
 */
export function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; message?: string; code?: number };
  const name = e.name ?? '';
  const message = e.message ?? '';

  if (name === 'QuotaExceededError') return true;
  if (e.code === 22 || e.code === 1014) return true;
  // idb reports a quota-aborted transaction as AbortError carrying the
  // original quota error in its message.
  if (name === 'AbortError' && /quota/i.test(message)) return true;

  return false;
}

/**
 * Run an IndexedDB write; if it fails because storage quota is exhausted, run
 * `evict` once to free space and retry the write exactly once.
 *
 * Any non-quota error is rethrown untouched. A quota error that survives
 * eviction (e.g. every row is dirty/protected, so nothing can be freed) is
 * also rethrown — the device is genuinely out of space and the caller should
 * see the failure rather than silently lose the write.
 *
 * @param write  The write operation. Re-invoked on retry, so it must open its
 *               own transaction (the original aborted one is dead).
 * @param evict  Frees space and returns the number of rows evicted.
 */
export async function withQuotaEviction<R>(
  write: () => Promise<R>,
  evict: () => Promise<number>,
  logger: Logger
): Promise<R> {
  try {
    return await write();
  } catch (err) {
    if (!isQuotaExceededError(err)) throw err;

    logger.warn(
      '[replication] Storage quota exceeded on write — evicting LRU rows and retrying once'
    );

    let evicted = 0;
    try {
      evicted = await evict();
    } catch (evictErr) {
      logger.error('[replication] Eviction failed during quota recovery:', evictErr);
      throw err; // surface the original quota error, not the eviction failure
    }

    if (evicted === 0) {
      // Nothing was evictable (all rows dirty/recently-touched). Retrying would
      // just abort again — fail fast with the original error.
      logger.error('[replication] Quota recovery freed no rows; write cannot proceed');
      throw err;
    }

    logger.log(`[replication] Evicted ${evicted} rows to relieve quota; retrying write`);
    return await write();
  }
}

/**
 * Free space by deleting the least-recently-accessed CLEAN cache rows from the
 * replicated-tables store, across every table. The eviction callback when a
 * mutation write hits storage quota (MutationQueueStore), and the fallback when
 * an atomic row+mutation write finds nothing clean in its own table (MYK9-1471). Dirty/unsynced rows are never deleted, so an offline
 * score can make room without losing other unsynced data. Best-effort:
 * returns 0 (write cannot proceed) if nothing clean is evictable or the scan
 * fails.
 */
export async function evictCleanCacheRows(db: IDBPDatabase): Promise<number> {
  try {
    const all = (await db.getAll(REPLICATION_STORES.REPLICATED_TABLES)) as ReplicatedRow<unknown>[];
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

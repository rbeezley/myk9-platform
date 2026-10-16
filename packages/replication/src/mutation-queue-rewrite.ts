import { unwrap, type IDBPDatabase } from 'idb';
import { REPLICATION_STORES } from './core/DatabaseManager';
import type { PendingMutation } from './types';

/**
 * Rewrite queued mutations by id, each from its CURRENT record, in one
 * readwrite transaction (MYK9-791).
 *
 * Callers pick their candidates from an earlier read, and must await work that
 * is not IndexedDB (an owner check) before writing. A mutation that uploaded
 * and was acknowledged in that gap is gone; putting the earlier copy back would
 * upload it a second time. So each id is re-read here and a missing one is
 * skipped, and the rewrite starts from what is stored now, not from the read.
 *
 * Raw IndexedDB, with each put issued from its read's own success callback:
 * that is the one place the transaction is guaranteed active. Resuming after an
 * awaited promise is not (under fake timers the transaction had already
 * committed); `putStampingCurrentServerVersion` does the same for this reason.
 *
 * @param rewrite returns the record to store, or undefined to leave it as is.
 *   A throw aborts the transaction, so nothing is written.
 * @returns the number of mutations written.
 */
export async function rewriteQueuedMutations(
  db: IDBPDatabase,
  ids: readonly string[],
  rewrite: (current: PendingMutation) => PendingMutation | undefined
): Promise<number> {
  if (ids.length === 0) return 0;
  const tx = (unwrap(db) as IDBDatabase).transaction(
    REPLICATION_STORES.PENDING_MUTATIONS,
    'readwrite'
  );
  const store = tx.objectStore(REPLICATION_STORES.PENDING_MUTATIONS);
  let written = 0;
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Queue transaction aborted'));
    for (const id of ids) {
      const read = store.get(id);
      read.onsuccess = () => {
        const current = read.result as PendingMutation | undefined;
        const next = current ? rewrite(current) : undefined;
        if (!next) return;
        store.put(next);
        written++;
      };
    }
  });
  return written;
}

/**
 * Rebase one queued UPDATE onto a newer server token. The token only moves
 * forward. A full-row UPDATE is advanced only with a rebuilt payload (otherwise
 * advancing the token would trade a 40001 for a silent clobber), and keeps every
 * explicitly queued key the rebuilt payload omits.
 *
 * @returns the rebased mutation, or undefined when it cannot be advanced.
 */
export function rebaseQueuedMutation(
  mutation: PendingMutation,
  newServerVersion: number,
  rebuiltData: Record<string, unknown> | undefined,
  legacyOmittedKeysServerWins: readonly string[]
): PendingMutation | undefined {
  const isRpc = mutation.rpc !== undefined;
  if (!isRpc && rebuiltData === undefined) return undefined;

  const serverVersion =
    mutation.serverVersion === undefined || newServerVersion > mutation.serverVersion
      ? newServerVersion
      : mutation.serverVersion;
  const explicitDataKeys =
    mutation.explicitDataKeys ??
    Object.keys(mutation.data).filter(key => !legacyOmittedKeysServerWins.includes(key));
  if (isRpc || rebuiltData === undefined) {
    return { ...mutation, serverVersion, explicitDataKeys };
  }

  const data = { ...rebuiltData };
  for (const key of explicitDataKeys) {
    if (!(key in data) && Object.prototype.hasOwnProperty.call(mutation.data, key)) {
      data[key] = mutation.data[key];
    }
  }
  return { ...mutation, serverVersion, explicitDataKeys, data };
}

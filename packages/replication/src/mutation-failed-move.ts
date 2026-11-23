import type { IDBPDatabase } from 'idb';
import { REPLICATION_STORES } from './core/DatabaseManager';
import type { PendingMutation } from './types';

/**
 * Move a mutation from the pending queue to the failed store in ONE readwrite
 * transaction. Two separate writes leave a crash window where the mutation sits
 * in BOTH stores: it keeps auto-uploading while the Retry/Discard toast offers
 * conflicting user actions.
 */
export async function moveMutationToFailed(
  db: IDBPDatabase,
  failed: PendingMutation
): Promise<void> {
  const tx = db.transaction(
    [REPLICATION_STORES.FAILED_MUTATIONS, REPLICATION_STORES.PENDING_MUTATIONS],
    'readwrite'
  );
  await Promise.all([
    tx.objectStore(REPLICATION_STORES.FAILED_MUTATIONS).put(failed),
    tx.objectStore(REPLICATION_STORES.PENDING_MUTATIONS).delete(failed.id),
    tx.done,
  ]);
}

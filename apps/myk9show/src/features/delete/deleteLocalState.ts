/**
 * The local half of the one delete path. After the server says a record is gone
 * (this call deleted it, or it was already deleted) every local copy of it, and
 * of what went with it, leaves this device; after an Undo the same copies are
 * re-synced. Both walk the SAME declared table (`LOCAL_STORES_BY_KIND`), so no
 * outcome picks its own stores and the two directions cannot drift.
 *
 * The replicas pull only LIVE rows and never deliver a tombstone, so without the
 * purge a deleted item stays in IndexedDB. Both functions run only after the
 * server answered, so neither may throw: a step failure is logged and the rest
 * still run. No purge queues a mutation: the server already has the delete.
 */
import { logger } from '@/services/LoggingService';
import { quietly, resolveLocalScope } from './deleteLocalScope';
import { LOCAL_STORES, LOCAL_STORES_BY_KIND } from './deleteLocalStores';
import type { DeleteObjectKind, DeleteTarget } from './deleteTypes';

/** The record is gone on the server: drop every local copy. Never throws. */
export async function reconcileLocalDeletion(
  kind: DeleteObjectKind,
  target: DeleteTarget
): Promise<void> {
  try {
    const scope = await resolveLocalScope(kind, target);
    for (const name of LOCAL_STORES_BY_KIND[kind]) {
      await quietly(`purge:${name}`, target.id, () => LOCAL_STORES[name].purge(scope, target.id));
    }
  } catch (error) {
    logger.warn('Local delete reconcile failed; the server result stands', 'delete', {
      kind,
      id: target.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** The record was restored on the server: re-sync every copy the delete purged. Never throws. */
export async function reconcileLocalRestore(
  kind: DeleteObjectKind,
  target: DeleteTarget
): Promise<void> {
  try {
    // In table order: a later store reads what an earlier one just re-synced
    // (a show's classes are found through its re-synced trials).
    for (const name of LOCAL_STORES_BY_KIND[kind]) {
      await quietly(`restore:${name}`, target.id, () =>
        LOCAL_STORES[name].restore({ kind, target })
      );
    }
  } catch (error) {
    logger.warn('Local restore reconcile failed; background sync will catch up', 'delete', {
      kind,
      id: target.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

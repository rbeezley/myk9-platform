import type { IDBPDatabase } from 'idb';
import { REPLICATION_STORES } from './core/DatabaseManager';
import type { PendingMutation } from './types';

/**
 * A mutation queued ahead of its dirty row write is HELD (`heldForLocalWrite`)
 * until the write lands, so no upload pass can send and delete it first and
 * strand the dirty row (MYK9-1471). The hold is persisted on the mutation: a
 * pass in any tab sees it.
 *
 * A live write holds for milliseconds. A tab that dies mid-write leaves its hold
 * behind, and there is no tab identity to ask whether the owner is alive, so age
 * is the liveness signal: a hold older than this is abandoned and no longer
 * blocks upload (a crash costs this much delay, never a stuck mutation).
 */
export const HELD_FOR_LOCAL_WRITE_TTL_MS = 30_000;

export function isHeldForLocalWrite(mutation: PendingMutation, now: number): boolean {
  return (
    mutation.heldForLocalWrite !== undefined &&
    now - mutation.heldForLocalWrite < HELD_FOR_LOCAL_WRITE_TTL_MS
  );
}

function withoutHold(mutation: PendingMutation): PendingMutation {
  const released = { ...mutation };
  delete released.heldForLocalWrite;
  return released;
}

/**
 * Release a held mutation in ONE store write: clear the hold and stamp the
 * revision its dirty write produced (Discard revert, MYK9-1076, needs it).
 * Returns false when the mutation is gone (already uploaded or discarded).
 */
export async function releaseHeldMutation(
  db: IDBPDatabase,
  mutationId: string,
  rowRevision?: number
): Promise<boolean> {
  const tx = db.transaction(REPLICATION_STORES.PENDING_MUTATIONS, 'readwrite');
  const mutation = (await tx.store.get(mutationId)) as PendingMutation | undefined;
  if (mutation) {
    const released = withoutHold(mutation);
    if (rowRevision !== undefined && released.rowRevision === undefined) {
      released.rowRevision = rowRevision;
    }
    await tx.store.put(released);
  }
  await tx.done;
  return mutation !== undefined;
}

/** Clear every abandoned hold (see {@link HELD_FOR_LOCAL_WRITE_TTL_MS}). Returns how many. */
export async function releaseAbandonedHolds(db: IDBPDatabase, now: number): Promise<number> {
  const tx = db.transaction(REPLICATION_STORES.PENDING_MUTATIONS, 'readwrite');
  const all = (await tx.store.getAll()) as PendingMutation[];
  let released = 0;
  for (const mutation of all) {
    if (mutation.heldForLocalWrite === undefined || isHeldForLocalWrite(mutation, now)) continue;
    await tx.store.put(withoutHold(mutation));
    released++;
  }
  await tx.done;
  return released;
}

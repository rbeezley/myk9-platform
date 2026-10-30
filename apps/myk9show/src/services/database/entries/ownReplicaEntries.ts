/**
 * The viewer's own live entries as the entries replica holds them, with no network read.
 *
 * "Own" is the rule `getUserEntries`' replica fallback applies: the viewer handles the entry, or
 * owns its dog. The replica is per show, so an empty result here is an absence of knowledge, not
 * proof of no entries; callers that hide something on empty must say so.
 */

import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable.mapper';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { selectOwnedDogIds } from '@/utils/dogOwnership';

export async function readOwnReplicaEntries(personId: string): Promise<ReplicatedEntry[]> {
  const [entries, dogs] = await Promise.all([
    replicatedEntriesTable.getAllOrThrow(),
    replicatedDogsTable.getAllDogs(),
  ]);
  const ownedDogIds = selectOwnedDogIds(dogs, personId);
  return entries.filter(
    entry =>
      !entry.deletedAt &&
      !entry.deleted_at &&
      (entry.handlerId === personId || (entry.dogId ? ownedDogIds.has(entry.dogId) : false))
  );
}

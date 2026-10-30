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
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { formatClassLabel } from '@/lib/utils';
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

/** An own entry labelled for the Home card: the dog's call name and the class, from the replicas. */
export interface OwnReplicaEntryLabel {
  entryId: string;
  showId: string;
  entryStatus: string | undefined;
  checkInStatus: string | undefined;
  dogCallName: string;
  classLabel: string;
}

export async function readOwnReplicaEntryLabels(personId: string): Promise<OwnReplicaEntryLabel[]> {
  const [own, dogs, classes] = await Promise.all([
    readOwnReplicaEntries(personId),
    replicatedDogsTable.getAllDogs(),
    replicatedClassesTable.getAllOrThrow(),
  ]);
  const dogsById = new Map(dogs.map(dog => [dog.id, dog]));
  const classesById = new Map(classes.map(cls => [cls.id, cls]));
  return own.flatMap(entry => {
    if (!entry.showId) return [];
    const dog = entry.dogId ? dogsById.get(entry.dogId) : undefined;
    const cls = entry.classId ? classesById.get(entry.classId) : undefined;
    return [
      {
        entryId: entry.id,
        showId: entry.showId,
        entryStatus: entry.entryStatus ?? entry.status,
        checkInStatus: entry.checkInStatus ?? entry.check_in_status,
        dogCallName: dog?.callName || dog?.name || entry.dogCallName || 'Your dog',
        classLabel: cls
          ? formatClassLabel(cls.element ?? null, cls.level ?? null, cls.name, cls.section ?? null)
          : '',
      },
    ];
  });
}

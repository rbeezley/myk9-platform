import { toSecretaryEntry } from '@/services/database/entries/secretaryReadReplication';
import { mapSecretaryEntryToEntryManagementEntry } from '@/hooks/useEntryManagementData';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable.mapper';
import type { EntryManagementEntry } from '@/types/entry-management-types';

/** The real hops from a replicated row to the desk's entry: desk read model, then hook map (MYK9-1757 tests). */
export function projectReplicatedToDeskEntry(entry: ReplicatedEntry): EntryManagementEntry {
  const secretary = toSecretaryEntry(entry, {
    dogsMap: new Map([
      ['dog-1', { id: 'dog-1', name: 'Poppy', ownerId: 'person-1' } as unknown as ReplicatedDog],
    ]),
    classesMap: new Map([
      [
        'class-1',
        {
          id: 'class-1',
          name: 'Container Novice A',
          element: 'Container',
          level: 'Novice',
        } as unknown as ReplicatedClass,
      ],
    ]),
    armbandsByEntryId: new Map(),
    armbandsByDogId: new Map(),
    peopleMap: new Map(),
    enrollmentsMap: new Map(),
    trialsMap: new Map(),
    pullMetadataMap: new Map(),
  });
  return mapSecretaryEntryToEntryManagementEntry(secretary);
}

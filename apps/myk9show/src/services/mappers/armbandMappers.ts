/**
 * Armband Mappers
 *
 * Maps replicated armband data + joined dog/entry/class data
 * into the composite shape expected by armbandQueries consumers.
 */

import type { ReplicatedArmband } from '@/services/replication/ReplicatedArmbandsTable';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';

/**
 * The composite shape returned by lookupDogByArmband.
 * Matches the original PostgREST query's return shape.
 */
export interface ArmbandLookupResult {
  armband_number: string;
  dog: {
    id: string;
    name: string;
    breed: string;
    sex: string;
  };
  owner: {
    first_name: string;
    last_name: string;
  };
  entries: Array<{
    id: string;
    entry_status: string;
    handler: string | null;
    class_name: string;
    class_level: string | null;
  }>;
}

/**
 * Assemble the lookupDogByArmband composite from replicated data.
 *
 * Owner data comes from PostgREST (people table is not replicated),
 * so it must be passed in separately.
 */
export function mapArmbandLookup(
  armband: ReplicatedArmband,
  dog: ReplicatedDog,
  owner: { first_name: string; last_name: string },
  entries: ReplicatedEntry[],
  classesMap: Map<string, ReplicatedClass>
): ArmbandLookupResult {
  return {
    armband_number: armband.armbandNumber,
    dog: {
      id: dog.id,
      name: dog.name,
      breed: dog.breed,
      sex: dog.sex ?? '',
    },
    owner,
    entries: entries.map(entry => {
      const cls = entry.classId ? classesMap.get(entry.classId) : undefined;
      return {
        id: entry.id,
        entry_status: entry.entryStatus ?? '',
        handler: entry.handler ?? null,
        class_name: cls?.name ?? '',
        class_level: cls?.level ?? null,
      };
    }),
  };
}

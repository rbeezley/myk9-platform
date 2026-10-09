import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import { replicatedShowDeskPeopleTable } from '@/services/replication/ReplicatedShowDeskPeopleTable';

/**
 * Replica-first answers for the two hybrid parts of a dog read (MYK9-1071).
 * Both tables replicate since MYK9-1071, so once a replica has completed a sync
 * it answers on its own, offline included, and a queued edit shows at once.
 * Each returns null while its replica is cold or unreadable; the caller then
 * keeps its PostgREST read.
 */

/**
 * Registrations from a WARM replica, split into rows the server has and rows
 * only this device has, for `loadDogRegistrations` to merge exactly as it merges
 * its cold server and replica legs. A warm replica holds every registration RLS
 * shows this user, so its answer is a complete read: a dog with no rows
 * genuinely has none (the MYK9-90 present-and-empty rule).
 */
export async function readWarmReplicaRegistrations(
  dogIds: string[]
): Promise<{ synced: Record<string, unknown>[]; local: Record<string, unknown>[] } | null> {
  try {
    if (await replicatedDogRegistrationsTable.isCold()) return null;
    return await replicatedDogRegistrationsTable.getRegistrationsForDogsPartitioned(dogIds);
  } catch {
    return null;
  }
}

/** The owner columns the dog roster reads, keyed by person id. */
export interface ReplicaOwnerRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
}

/**
 * Owners from a WARM people replica, or null to fall back. Null as well when a
 * requested owner is missing locally: a partial map would show an owner as
 * unknown, so the server read answers instead.
 */
export async function readWarmReplicaOwners(
  ownerIds: string[]
): Promise<Map<string, ReplicaOwnerRow> | null> {
  try {
    if (await replicatedShowDeskPeopleTable.isCold()) return null;
    const people = await replicatedShowDeskPeopleTable.getPeopleByIds(ownerIds);
    if (people.length < new Set(ownerIds).size) return null;
    return new Map(
      people.map(person => [
        person.id,
        {
          id: person.id,
          first_name: person.firstName,
          last_name: person.lastName,
          email: person.email ?? null,
          phone: person.phone ?? null,
          street_address: person.address ?? null,
          city: person.city ?? null,
          state: person.state ?? null,
          zip_code: person.zipCode ?? null,
        },
      ])
    );
  } catch {
    return null;
  }
}

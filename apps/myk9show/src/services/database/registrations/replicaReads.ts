/**
 * One dog's registrations for the dog page (the Registrations section and the
 * Manage registrations panel), read from the replica when it is warm
 * (MYK9-1090, plan §2).
 *
 * Warm (trusted, see dogRegistrationsTrust.ts): the replica answers, with no
 * network request, so it works offline, and an empty answer means the dog has
 * no registrations. Cold (not trusted) or unreadable: PostgREST answers, and a
 * failed read throws so the screen shows an error, never an empty list
 * (MYK9-90).
 */
import {
  replicatedDogRegistrationsTable,
  type DogRegistrationReadRow,
} from '@/services/replication/ReplicatedDogRegistrationsTable';
import { getRegistrationsByDog } from './reads';

/** `registration_date` descending with nulls first, PostgREST's `order(..., { ascending: false })`. */
function byRegistrationDateDesc(a: DogRegistrationReadRow, b: DogRegistrationReadRow): number {
  const left = a.registration_date;
  const right = b.registration_date;
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return left < right ? 1 : -1;
}

export async function readRegistrationsForDog(dogId: string): Promise<DogRegistrationReadRow[]> {
  const local = await replicatedDogRegistrationsTable.readForDogs([dogId]);
  if (local.state === 'warm') return [...local.rows].sort(byRegistrationDateDesc);

  const { data, error } = await getRegistrationsByDog(dogId);
  if (error) throw error;
  return data;
}

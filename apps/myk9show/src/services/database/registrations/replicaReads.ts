/**
 * One dog's registrations for the dog page (the Registrations section and the
 * Manage registrations panel), MYK9-1090, plan §2.
 *
 * Server first: a successful PostgREST read, plus only this device's unsent
 * work (dirty rows, offline-created placeholders hidden once their server
 * twin is present). When the server cannot be read, the device copy answers,
 * labelled `source: 'device'` so the screen says it is an offline copy and
 * may be out of date. If the device cannot be read either, the read throws:
 * an error is shown, never an empty list (MYK9-90).
 */
import {
  replicatedDogRegistrationsTable,
  type DogRegistrationReadRow,
} from '@/services/replication/ReplicatedDogRegistrationsTable';
import { appendRegistrations } from '../dogs/reads';
import { getRegistrationsByDog } from './reads';

export interface RegistrationsForDog {
  rows: DogRegistrationReadRow[];
  /** `device`: the server could not be read; this is the offline copy. */
  source: 'server' | 'device';
}

/** `registration_date` descending with nulls first, PostgREST's `order(..., { ascending: false })`. */
function byRegistrationDateDesc(a: DogRegistrationReadRow, b: DogRegistrationReadRow): number {
  const left = a.registration_date;
  const right = b.registration_date;
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return left < right ? 1 : -1;
}

export async function readRegistrationsForDog(dogId: string): Promise<RegistrationsForDog> {
  const server = await getRegistrationsByDog(dogId);
  const source = server.error ? 'device' : 'server';
  const local =
    source === 'server'
      ? await replicatedDogRegistrationsTable.getUnsentRegistrationsForDogs([dogId])
      : await replicatedDogRegistrationsTable.getRegistrationsForDogs([dogId]);

  // Server rows first; a local row that repeats one (same id, or same
  // organization and number) is dropped.
  const merged = new Map<string, Record<string, unknown>[]>();
  appendRegistrations(merged, server.error ? [] : server.data);
  appendRegistrations(merged, local);
  const rows = (merged.get(dogId) ?? []) as unknown as DogRegistrationReadRow[];
  return { rows: [...rows].sort(byRegistrationDateDesc), source };
}

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
import { mergeUnsentWork } from '@/services/replication/dogRegistrationMerge';
import { getRegistrationsByDog } from './reads';
import { serverUnreachable } from './serverUnreachable';
import { unsentWorkProvenByServer } from './unsentWork';

export interface RegistrationsForDog {
  rows: DogRegistrationReadRow[];
  /** `device`: the server could not be read; this is the offline copy. */
  source: 'server' | 'device';
  /**
   * `device` reads only: the replica holds some row for this dog, shown or not
   * (a pending delete and a resolved placeholder are hidden but held). An empty
   * `rows` with this true was emptied by local work, not never saved.
   */
  deviceHeldRows?: boolean;
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
  // Only an unreachable server falls back to the device copy; a server that
  // answered with an error is an error, with the screens' retry.
  if (server.error && !serverUnreachable(server.error)) throw server.error;
  const source = server.error ? 'device' : 'server';
  // With the server's answer in hand, a device that cannot be read only costs
  // this device's unsent work, never the server rows (Codex review). Without
  // it, the device copy is the answer, and a device failure is the error.
  // Server rows with this device's unsent edits, deletes and adds applied
  // (mergeUnsentWork): an unsent edit wins, a pending delete hides its row.
  const rows =
    source === 'server'
      ? mergeUnsentWork(
          server.data,
          await unsentWorkProvenByServer([dogId], server.data).catch(() => [])
        )
      : await replicatedDogRegistrationsTable.getRegistrationsForDogs([dogId]);
  const merged = new Map<string, Record<string, unknown>[]>();
  appendRegistrations(merged, rows);
  const forDog = (merged.get(dogId) ?? []) as unknown as DogRegistrationReadRow[];
  const sorted = [...forDog].sort(byRegistrationDateDesc);
  if (source === 'server') return { rows: sorted, source };
  return { rows: sorted, source, deviceHeldRows: await deviceHoldsRowsFor(dogId, sorted.length) };
}

/**
 * Whether the replica holds any row for this dog. Every row hidden from the
 * device read (a pending delete, a resolved placeholder) is unsent work, so
 * shown rows plus unsent work cover everything held. When the unsent work
 * cannot be read, assume rows are held: the safe answer never shows the
 * dog record's registrations in place of work this device cannot see.
 */
async function deviceHoldsRowsFor(dogId: string, shownRows: number): Promise<boolean> {
  if (shownRows > 0) return true;
  try {
    return (await replicatedDogRegistrationsTable.getUnsentWorkForDogs([dogId])).length > 0;
  } catch {
    return true;
  }
}

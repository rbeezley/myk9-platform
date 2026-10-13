/**
 * One dog with full details (the dog page), server first (MYK9-1126).
 *
 * The dogs replica is not cleared on sign-out (MYK9-202), so on a shared
 * browser it can hold the previous account's dogs until the next account's
 * sync prunes them. Answering this read from the replica while online handed
 * account B any of account A's dogs by id. So, the PR 2 shape
 * (`registrations/replicaReads.ts`):
 *
 * - Online, the server answers: the dog, owner, registrations and health
 *   records as RLS lets this account see them. A clean replica copy never
 *   wins. Two kinds of this device's unsent work are laid over it: the dog's
 *   own fields when the signed-in account's queue names the dog with a pending
 *   or failed mutation (an edit, or an offline create the server has not seen
 *   yet), and
 *   unsent registrations. Registrations come from `loadDogRegistrations`, the
 *   roster's read, so the dog page and the roster resolve the same primary
 *   registration (one merge rule: `dropServerTwins` + local creation order).
 * - Only when the server cannot be REACHED (`serverUnreachable`) does the
 *   device copy answer. A server that answered with an error is an error,
 *   never an empty or missing dog.
 *
 * No entries. Authenticated users hold only column-level SELECT on `entries`
 * (20260620001929), so an `entries(*)` embed fails the whole read, and the dog
 * page reads a dog's entries itself through `getEntriesByDog` (the allowlisted
 * columns, scored results and its own offline fallback). Nothing reads
 * entries off this row.
 */
import { supabase, createDatabaseError, type DatabaseError } from '../supabaseClient';
import {
  replicatedDogsTable,
  type ReplicatedDog,
} from '@/services/replication/ReplicatedDogsTable';
import { mapReplicatedDogToDbRow } from '@/services/mappers/dogMappers';
import { serverUnreachable } from '../registrations/serverUnreachable';
import { loadDogRegistrations, type DogRegistrationsResult } from './reads';

type DogDetailRow = Record<string, unknown>;

export interface DogDetailResult {
  data: DogDetailRow | null;
  error: DatabaseError | null;
}

/** PostgREST's "no rows" for `.single()`: the dog is gone or this account cannot see it. */
const NOT_FOUND = 'PGRST116';

async function readServerDog(id: string): Promise<DogDetailResult> {
  try {
    const { data, error } = await supabase
      .from('dogs')
      .select(
        `
        *,
        owner:people!dogs_owner_id_fkey(
          id,
          first_name,
          last_name,
          email,
          phone,
          street_address,
          city,
          state,
          zip_code
        ),
        health_records(*)
      `
      )
      .eq('id', id)
      .is('deleted_at', null)
      .single();
    if (error) return { data: null, error: createDatabaseError(error, 'dog', 'select_by_id') };
    return { data: data as DogDetailRow, error: null };
  } catch (error) {
    // A thrown network failure must reach `serverUnreachable`, not escape.
    return { data: null, error: createDatabaseError(error, 'dog', 'select_by_id') };
  }
}

/**
 * The device's copy of the dog, when the signed-in account has a pending
 * mutation for it, or a failed one kept for Retry or Discard. The queue read is
 * owner-scoped (`getUnsentMutationIdsForRow` reads only the signed-in user's
 * mutations), so another account's unsent work on this device never overlays
 * this account's read. An unreadable queue means no overlay: the server copy
 * stands.
 */
async function ownUnsentDog(id: string): Promise<ReplicatedDog | null> {
  try {
    const unsent = await replicatedDogsTable.getUnsentMutationIdsForRow(id);
    if (unsent.length === 0) return null;
    return await replicatedDogsTable.getDogById(id);
  } catch {
    return null;
  }
}

/** The dog's own fields from the device; the server's owner and health records. */
function overlayUnsentDog(serverRow: DogDetailRow, dog: ReplicatedDog): DogDetailRow {
  const deviceFields = mapReplicatedDogToDbRow(dog);
  delete deviceFields.owner;
  delete deviceFields.registrations;
  return { ...serverRow, ...deviceFields };
}

/** The device copy: the replica's dog, with whatever owner and registrations can be read. */
async function readDeviceDog(
  id: string,
  registrationsResult: DogRegistrationsResult
): Promise<DogDetailResult> {
  try {
    const dog = await replicatedDogsTable.getDogById(id);
    if (!dog) {
      return {
        data: null,
        error: createDatabaseError(
          new Error(
            'This dog could not be loaded: the server is unreachable and it is not saved on this device.'
          ),
          'dog',
          'select_by_id_device'
        ),
      };
    }

    const supplementalResult = await supabase
      .from('dogs')
      .select(
        `
        owner:people!dogs_owner_id_fkey(
          id,
          first_name,
          last_name,
          email,
          phone,
          street_address,
          city,
          state,
          zip_code
        ),
        health_records(*)
      `
      )
      .eq('id', id)
      .single();

    const supplemental = supplementalResult.data as DogDetailRow | null;
    const data = mapReplicatedDogToDbRow(dog, {
      owner: (supplemental?.owner as Record<string, unknown> | null | undefined) ?? null,
      registrations: registrationsResult.byDog.get(id) ?? [],
      registrationsReadComplete: registrationsResult.registrationsReadComplete,
      healthRecords: (supplemental?.health_records as Record<string, unknown>[] | undefined) ?? [],
    });
    return { data, error: null };
  } catch (error) {
    return { data: null, error: createDatabaseError(error, 'dog', 'select_by_id_device') };
  }
}

export async function getDogById(id: string): Promise<DogDetailResult> {
  // In parallel: the registrations read is the roster's, and on its own
  // falls back to the device copy when the server cannot be reached.
  const [server, registrationsResult] = await Promise.all([
    readServerDog(id),
    loadDogRegistrations([id]),
  ]);
  if (server.error) {
    if (serverUnreachable(server.error)) return readDeviceDog(id, registrationsResult);
    // An offline create the server has not received yet: this account's own
    // unsent dog, shown from the device until its upload lands.
    if (server.error.code === NOT_FOUND && (await ownUnsentDog(id)))
      return readDeviceDog(id, registrationsResult);
    return { data: null, error: server.error };
  }

  if (!server.data) {
    return {
      data: null,
      error: createDatabaseError(new Error('The server returned no dog'), 'dog', 'select_by_id'),
    };
  }

  const own = await ownUnsentDog(id);
  const row = own ? overlayUnsentDog(server.data, own) : server.data;
  return {
    data: {
      ...row,
      registrations: registrationsResult.byDog.get(id) ?? [],
      registrations_read_complete: registrationsResult.registrationsReadComplete,
    },
    error: null,
  };
}

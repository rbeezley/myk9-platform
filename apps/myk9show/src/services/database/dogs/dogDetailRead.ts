/**
 * One dog with full details (the dog page), server first (MYK9-1126).
 *
 * The dogs replica is not cleared on sign-out (MYK9-202), so on a shared
 * browser it can hold the previous account's dogs until the next account's
 * sync prunes them. Answering this read from the replica while online handed
 * account B any of account A's dogs by id. So, the PR 2 shape
 * (`registrations/replicaReads.ts`):
 *
 * - Online, the server answers: the dog, owner, registrations, health records
 *   and entries as RLS lets this account see them. A clean replica copy never
 *   wins. Two kinds of this device's unsent work are laid over it: the dog's
 *   own fields when the signed-in account's pending-mutation queue names the
 *   dog (an edit, or an offline create the server has not seen yet), and
 *   unsent registrations, as `loadDogRegistrations` merges them.
 * - Only when the server cannot be REACHED (`serverUnreachable`) does the
 *   device copy answer. A server that answered with an error is an error,
 *   never an empty or missing dog.
 */
import { supabase, createDatabaseError, type DatabaseError } from '../supabaseClient';
import {
  replicatedDogsTable,
  type ReplicatedDog,
} from '@/services/replication/ReplicatedDogsTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import { dropServerTwins } from '@/services/replication/dogRegistrationRows';
import { mapReplicatedDogToDbRow } from '@/services/mappers/dogMappers';
import { serverUnreachable } from '../registrations/serverUnreachable';
import { appendRegistrations, loadDogRegistrations } from './reads';

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
        registrations:dog_registrations(*),
        health_records(*),
        entries(
          *,
          class:classes(
            id,
            name,
            class_number
          ),
          show:shows(
            id,
            name,
            start_date,
            end_date
          )
        )
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
 * mutation for it. The queue read is owner-scoped (`getPendingMutationIdsForRow`
 * reads only the signed-in user's mutations), so another account's unsent
 * work on this device never overlays this account's read. An unreadable queue
 * means no overlay: the server copy stands.
 */
async function ownUnsentDog(id: string): Promise<ReplicatedDog | null> {
  try {
    const pending = await replicatedDogsTable.getPendingMutationIdsForRow(id);
    if (pending.length === 0) return null;
    return await replicatedDogsTable.getDogById(id);
  } catch {
    return null;
  }
}

/** The dog's own fields from the device; the server's owner, registrations, entries and health records. */
function overlayUnsentDog(serverRow: DogDetailRow, dog: ReplicatedDog): DogDetailRow {
  const deviceFields = mapReplicatedDogToDbRow(dog);
  delete deviceFields.owner;
  delete deviceFields.registrations;
  return { ...serverRow, ...deviceFields };
}

/** Add this device's unsent registrations, dropping any whose server copy is already here. */
async function withUnsentRegistrations(row: DogDetailRow, id: string): Promise<DogDetailRow> {
  let unsent: Record<string, unknown>[];
  try {
    unsent = await replicatedDogRegistrationsTable.getUnsentRegistrationsForDogs([id]);
  } catch {
    return row;
  }
  if (unsent.length === 0) return row;
  const serverRows = (row.registrations as Record<string, unknown>[] | undefined) ?? [];
  const merged = new Map<string, Record<string, unknown>[]>();
  appendRegistrations(
    merged,
    serverRows.map(registration => ({ ...registration, dog_id: registration.dog_id ?? id }))
  );
  appendRegistrations(merged, dropServerTwins(unsent, serverRows));
  return { ...row, registrations: merged.get(id) ?? [] };
}

/** The device copy: the replica's dog and entries, with whatever owner and registrations can be read. */
async function readDeviceDog(id: string): Promise<DogDetailResult> {
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

    const allEntries = await replicatedEntriesTable.getAllOrThrow();
    const dogEntries = allEntries.filter(e => e.dogId === id);

    const [registrationsResult, supplementalResult] = await Promise.all([
      loadDogRegistrations([id]),
      supabase
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
        .single(),
    ]);

    const supplemental = supplementalResult.data as DogDetailRow | null;
    const entries = dogEntries.map(e => ({
      id: e.id,
      class_id: e.classId ?? null,
      show_id: e.showId ?? null,
      dog_id: e.dogId ?? null,
      handler_id: e.handlerId ?? null,
      armband: e.armband ?? null,
      handler: e.handler ?? null,
      entry_status: e.entryStatus ?? null,
      jump_height: e.jumpHeight ?? null,
      entry_fee: e.entryFee ?? null,
      payment_status: e.paymentStatus ?? null,
      run_order: e.runOrder ?? null,
      move_up_requested: e.moveUpRequested ?? null,
      preferred_judge: e.preferredJudge ?? null,
      special_requests: e.specialRequests ?? null,
      submitted_at: e.submittedAt ?? null,
      // class and show sub-objects are not in the replica
      class: null,
      show: null,
    }));

    const data = mapReplicatedDogToDbRow(dog, {
      owner: (supplemental?.owner as Record<string, unknown> | null | undefined) ?? null,
      registrations: registrationsResult.byDog.get(id) ?? [],
      registrationsReadComplete: registrationsResult.registrationsReadComplete,
      entries,
      healthRecords: (supplemental?.health_records as Record<string, unknown>[] | undefined) ?? [],
    });
    return { data, error: null };
  } catch (error) {
    return { data: null, error: createDatabaseError(error, 'dog', 'select_by_id_device') };
  }
}

export async function getDogById(id: string): Promise<DogDetailResult> {
  const server = await readServerDog(id);
  if (server.error) {
    if (serverUnreachable(server.error)) return readDeviceDog(id);
    // An offline create the server has not received yet: this account's own
    // unsent dog, shown from the device until its upload lands.
    if (server.error.code === NOT_FOUND && (await ownUnsentDog(id))) return readDeviceDog(id);
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
  return { data: await withUnsentRegistrations(row, id), error: null };
}

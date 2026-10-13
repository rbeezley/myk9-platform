/**
 * What the queued registration writes need around them (MYK9-1090 plan §3,
 * MYK9-1075): the device row a write is built on (loaded when cold, refused
 * offline), a queued add cancelled before it is sent, and the upload pass's
 * word that a queued DELETE landed.
 */
import type { MutationManager, ReplicatedRow, UploadCompleteEventDetail } from '@myk9/replication';
import { logger } from '@myk9/core';
import { FriendlySaveError } from '@/utils/friendlySaveError';
import {
  registrationIdentityKey,
  visibleRegistrationRows,
  type DogRegistrationRow,
  type ReplicatedDogRegistration,
} from './dogRegistrationRows';
import { fetchRegistrationsWhere } from './dogRegistrationsServer';
import { replicatedDogsTable } from './ReplicatedDogsTable';
import { mergeUnsentWork } from './dogRegistrationMerge';
import { applyRegistrationChanges, registrationsNeedConnection } from './dogRegistrationWrites';

/** The parts of the registrations table these helpers use. */
export interface RegistrationsReplica {
  getTableName(): string;
  getReplicatedRow(id: string): Promise<ReplicatedRow<ReplicatedDogRegistration> | null>;
  applyServerRows(rows: readonly DogRegistrationRow[]): Promise<number>;
  getAllOrThrow(): Promise<ReplicatedDogRegistration[]>;
  getUnsentWorkForDogs(dogIds: string[]): Promise<ReplicatedDogRegistration[]>;
  delete(id: string): Promise<void>;
}

function deviceIsOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * The device row a write needs. Not on the device: read it from the server
 * when online; offline, or when that read fails, refuse with "Reconnect to
 * load this dog's registrations" and write nothing (plan §1 "Cold replica").
 */
export async function loadRowForWrite(
  table: RegistrationsReplica,
  id: string
): Promise<ReplicatedRow<ReplicatedDogRegistration>> {
  const local = await table.getReplicatedRow(id);
  if (local) return local;
  if (deviceIsOffline()) throw registrationsNeedConnection();
  try {
    await table.applyServerRows(await fetchRegistrationsWhere('id', [id]));
  } catch {
    throw registrationsNeedConnection();
  }
  const loaded = await table.getReplicatedRow(id);
  if (!loaded) {
    throw new FriendlySaveError('This registration is no longer there. Refresh and try again.');
  }
  return loaded;
}

/** A registration Edit dog may change: its row id and organization. */
export interface EditableRegistration {
  id: string;
  organization: string;
}

/**
 * One dog's registrations, for a write built on what exists (Edit dog's
 * registration fields).
 *
 * - `server: true`: the server's rows (also stored in the replica) plus this
 *   device's unsent work (`mergeUnsentWork`). A cached copy the server no
 *   longer returns is not a candidate (Codex review of PR 3a).
 * - `server: false`: the server could not be read; the registrations on the
 *   device. The caller may only edit these: absence proves nothing.
 */
export async function loadDogRegistrationsForEdit(
  table: RegistrationsReplica,
  dogId: string
): Promise<{ registrations: EditableRegistration[]; server: boolean }> {
  if (!deviceIsOffline()) {
    try {
      const serverRows = await fetchRegistrationsWhere('dog_id', [dogId]);
      await table.applyServerRows(serverRows);
      const merged = mergeUnsentWork(serverRows, await table.getUnsentWorkForDogs([dogId]));
      return {
        registrations: merged.map(row => ({
          id: String(row.id),
          organization: String(row.organization ?? ''),
        })),
        server: true,
      };
    } catch (error) {
      logger.warn(`[${table.getTableName()}] Could not read dog ${dogId}'s registrations`, error);
    }
  }
  return {
    registrations: visibleRegistrationRows(await table.getAllOrThrow(), [dogId]),
    server: false,
  };
}

/**
 * True when the server refused this row's INSERT (a failed mutation the user
 * has not retried or discarded).
 */
export async function hasRefusedInsert(
  table: RegistrationsReplica,
  queue: MutationManager | null,
  id: string
): Promise<boolean> {
  if (!queue) return false;
  return (await queue.getFailedMutations()).some(
    m => m.tableName === table.getTableName() && String(m.rowId) === id && m.operation === 'INSERT'
  );
}

/**
 * Work an edit or delete must upload after: the row's own queued mutations
 * (its INSERT, which may replay as a duplicate after a lost acknowledgement)
 * and its dog's (a create still queued). Never out of order after a backoff.
 */
export async function queuedWorkBefore(
  table: { getPendingMutationIdsForRow(rowId: string): Promise<string[]> },
  row: ReplicatedDogRegistration
): Promise<string[]> {
  return [
    ...(await table.getPendingMutationIdsForRow(row.id)),
    ...(await replicatedDogsTable.getPendingMutationIdsForRow(row.dogId)),
  ];
}

/**
 * Write an edit's changed columns onto the row AS IT IS NOW, re-read for the
 * write and stored only if nothing changed it in between (`set`'s revision
 * check, retried). Never onto the snapshot the edit was read from: a download
 * that landed meanwhile keeps its fields (Codex final round).
 */
export async function writeChangesOntoCurrentRow(
  table: RegistrationsReplica & {
    set(
      id: string,
      data: ReplicatedDogRegistration,
      isDirty: boolean,
      expectedVersion?: number
    ): Promise<unknown>;
  },
  id: string,
  changes: Readonly<Record<string, unknown>>
): Promise<ReplicatedDogRegistration> {
  for (let attempt = 0; ; attempt++) {
    const current = await table.getReplicatedRow(id);
    if (!current) {
      throw new FriendlySaveError('This registration is no longer there. Refresh and try again.');
    }
    const next = applyRegistrationChanges(current.data, changes);
    try {
      await table.set(id, next, true, current.version);
      return next;
    } catch (error) {
      if (attempt >= 4 || !/Concurrent modification/.test(String(error))) throw error;
    }
  }
}

/**
 * The queued DELETEs of any registration with this organization and number
 * (normalised, any dog): a re-add must upload after them, or the live
 * org/number unique index refuses its INSERT (Codex final round).
 */
export async function pendingDeletesOfNumber(
  table: RegistrationsReplica & { getPendingMutationIdsForRow(rowId: string): Promise<string[]> },
  organization: string | null | undefined,
  registrationNumber: string | null | undefined
): Promise<string[]> {
  const key = registrationIdentityKey({ dogId: '', organization, registrationNumber });
  if (key === null) return [];
  const deleting = (await table.getAllOrThrow()).filter(
    row => row._pendingDelete === true && registrationIdentityKey({ ...row, dogId: '' }) === key
  );
  return (await Promise.all(deleting.map(row => table.getPendingMutationIdsForRow(row.id)))).flat();
}

/** Drop this user's queued mutations for a registration row. */
async function discardPendingWork(
  table: RegistrationsReplica,
  queue: MutationManager | null,
  id: string
): Promise<void> {
  await queue?.discardPendingMutationsForRow(table.getTableName(), id);
}

/** Drop this user's refused mutations for a registration row. */
async function discardFailedWork(
  table: RegistrationsReplica,
  queue: MutationManager | null,
  id: string
): Promise<void> {
  if (!queue) return;
  for (const mutation of await queue.getFailedMutations()) {
    if (mutation.tableName === table.getTableName() && String(mutation.rowId) === id) {
      await queue.discardFailedMutation(mutation.id);
    }
  }
}

/**
 * Drop a queued add the server has not received: its queued (or refused)
 * mutations, then the row. An INSERT already in flight may still land; the
 * next sync then brings the row back, and it can be deleted again.
 */
export async function cancelUnsentAdd(
  table: RegistrationsReplica,
  queue: MutationManager | null,
  id: string
): Promise<void> {
  await discardPendingWork(table, queue, id);
  await discardFailedWork(table, queue, id);
  await table.delete(id);
}

/**
 * Call `onDeleted` with the row ids of every DELETE on `tableName` an upload
 * pass confirmed: the pass names each uploaded mutation in its
 * `replication:upload-complete` event. Returns the unsubscribe.
 */
export function listenForConfirmedDeletes(
  tableName: string,
  onDeleted: (ids: string[]) => Promise<void>
): () => void {
  const onUploadComplete = (event: Event) => {
    const mutations = (event as CustomEvent<UploadCompleteEventDetail>).detail?.mutations ?? [];
    const ids = mutations
      .filter(m => m.tableName === tableName && m.operation === 'DELETE')
      .map(m => String(m.rowId));
    if (ids.length === 0) return;
    onDeleted(ids).catch((error: unknown) => {
      logger.warn(`[${tableName}] Confirmed deletes not removed; the ID pass will`, error);
    });
  };
  window.addEventListener('replication:upload-complete', onUploadComplete);
  return () => window.removeEventListener('replication:upload-complete', onUploadComplete);
}

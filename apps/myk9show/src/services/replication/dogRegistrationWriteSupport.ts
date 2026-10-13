/**
 * What the queued registration writes need around them (MYK9-1090 plan §3,
 * MYK9-1075): the device row a write is built on (loaded when cold, refused
 * offline), a queued add cancelled before it is sent, and the upload pass's
 * word that a queued DELETE landed.
 */
import type {
  MutationManager,
  ReplicatedRow,
  SyncMetadata,
  UploadCompleteEventDetail,
} from '@myk9/replication';
import { logger } from '@myk9/core';
import { FriendlySaveError } from '@/utils/friendlySaveError';
import {
  visibleRegistrationRows,
  type DogRegistrationRow,
  type ReplicatedDogRegistration,
} from './dogRegistrationRows';
import { fetchRegistrationsWhere } from './dogRegistrationsServer';
import { registrationsNeedConnection } from './dogRegistrationWrites';

/** The parts of the registrations table these helpers use. */
export interface RegistrationsReplica {
  getTableName(): string;
  getReplicatedRow(id: string): Promise<ReplicatedRow<ReplicatedDogRegistration> | null>;
  applyServerRows(rows: readonly DogRegistrationRow[]): Promise<number>;
  getAllOrThrow(): Promise<ReplicatedDogRegistration[]>;
  getSyncMetadata(): Promise<SyncMetadata | null>;
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

/**
 * One dog's registrations, for a write built on what exists (Edit dog's
 * registration fields). Online, the dog's rows are read into the replica
 * first. Offline on a replica that has never synced, the device cannot tell
 * "none" from "not loaded": refuse rather than add a duplicate.
 */
export async function loadDogRegistrationsForEdit(
  table: RegistrationsReplica,
  dogId: string
): Promise<ReplicatedDogRegistration[]> {
  let loaded = false;
  if (!deviceIsOffline()) {
    try {
      await table.applyServerRows(await fetchRegistrationsWhere('dog_id', [dogId]));
      loaded = true;
    } catch (error) {
      logger.warn(`[${table.getTableName()}] Could not load dog ${dogId}'s registrations`, error);
    }
  }
  if (!loaded && !(await table.getSyncMetadata())?.lastFullSyncAt) {
    throw registrationsNeedConnection();
  }
  return visibleRegistrationRows(await table.getAllOrThrow(), [dogId]);
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
  const tableName = table.getTableName();
  if (queue) {
    await queue.discardPendingMutationsForRow(tableName, id);
    const failed = await queue.getFailedMutations();
    for (const mutation of failed) {
      if (mutation.tableName === tableName && String(mutation.rowId) === id) {
        await queue.discardFailedMutation(mutation.id);
      }
    }
  }
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

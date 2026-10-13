/**
 * Registration EDITS are online-only (MYK9-1090, narrowed after six Codex
 * review rounds each found a concurrency P1 in the offline edit path). An
 * edit goes straight to the server; it is refused BEFORE anything is written
 * when the device is offline, or when the row still has unsent work on this
 * device (an add whose INSERT has not been confirmed, a delete waiting to
 * upload, or a refused write awaiting Retry or Discard). Offline adds and
 * deletes stay queued.
 */
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import { REGISTRATION_CHANGES_NEED_CONNECTION } from '@/services/replication/dogRegistrationWrites';
import { FriendlySaveError } from '@/utils/friendlySaveError';
import type { DbDogRegistrationUpdate } from '@/types/database-mappings';
import { updateRegistration } from './reads';

export const REGISTRATION_STILL_SAVING =
  'This registration is still saving. Try again in a moment.';

export async function assertRegistrationEditable(id: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new FriendlySaveError(`${REGISTRATION_CHANGES_NEED_CONNECTION}.`);
  }
  const row = await replicatedDogRegistrationsTable.getReplicatedRow(id);
  // The queue is the authority on unsent work; a dirty or device-only row
  // also has some. A leftover add flag on a clean row is not.
  const deviceOnly = row?.isDirty === true || row?.data._localOnly === true;
  if (
    deviceOnly ||
    (await replicatedDogRegistrationsTable.getUnsentMutationIdsForRow(id)).length > 0
  ) {
    throw new FriendlySaveError(REGISTRATION_STILL_SAVING);
  }
}

/** An online-only registration edit: refused as above, else saved on the server. */
export async function saveRegistrationEditOnline(
  id: string,
  updates: DbDogRegistrationUpdate
): Promise<void> {
  await assertRegistrationEditable(id);
  const { error } = await updateRegistration(id, updates);
  if (error) throw error;
}

/**
 * Mirror a direct registration write into the replica (MYK9-1090, plan §2).
 *
 * The dog page's registration readers fall back to the replica when the
 * server cannot be read, so a write that went straight to PostgREST must land
 * in the replica too, or that offline copy keeps the old value until the next
 * sync. Every direct write in `reads.ts` calls one of these after the server
 * confirms it; PR 3 replaces those writes with queued ones.
 *
 * Never throws: the server write already succeeded. When the mirror fails, the
 * table still tells its subscribers to re-read, so the server-first readers
 * refresh; the next sync puts the device copy right.
 */
import { logger } from '@/services/LoggingService';
import {
  replicatedDogRegistrationsTable,
  type DogRegistrationRow,
} from '@/services/replication/ReplicatedDogRegistrationsTable';

async function notifyAfterFailedMirror(operation: string, error: unknown): Promise<void> {
  logger.warn('Registration write not mirrored to this device', 'replication', {
    operation,
    error: error instanceof Error ? error.message : String(error),
  });
  try {
    await replicatedDogRegistrationsTable.notifyChanged();
  } catch {
    // Nothing further to do: the next sync refreshes the readers.
  }
}

/** Store the row the server returned from an insert or update. */
export async function mirrorServerRegistration(row: unknown): Promise<void> {
  if (!row || typeof row !== 'object') return;
  try {
    await replicatedDogRegistrationsTable.applyServerRows([row as DogRegistrationRow]);
  } catch (error) {
    await notifyAfterFailedMirror('upsert', error);
  }
}

/**
 * Remove a registration the server just deleted, and any offline-created
 * placeholder that is its twin (`deletedRow` carries dog and created_at).
 */
export async function mirrorServerDelete(
  id: string,
  deletedRow?: Record<string, unknown>
): Promise<void> {
  try {
    await replicatedDogRegistrationsTable.removeDeletedOnServer(id, deletedRow);
  } catch (error) {
    await notifyAfterFailedMirror('delete', error);
  }
}

/** Re-read a dog's registrations after a server-side create wrote them. */
export async function mirrorServerDogRegistrations(dogId: string): Promise<void> {
  try {
    await replicatedDogRegistrationsTable.refreshDogFromServer(dogId);
  } catch (error) {
    await notifyAfterFailedMirror('refresh-dog', error);
  }
}

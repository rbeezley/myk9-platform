/**
 * Mirror a direct server-side registration write into the replica (MYK9-1090).
 *
 * The dog page's registration readers fall back to the replica when the
 * server cannot be read, so registrations written straight to the server (the
 * online `create_dog_with_registrations` path) must land in the replica too,
 * or that offline copy lacks them until the next sync. Every other
 * registration write is queued on the replica itself.
 *
 * Never throws: the server write already succeeded. When the mirror fails, the
 * table still tells its subscribers to re-read, so the server-first readers
 * refresh; the next sync puts the device copy right.
 */
import { logger } from '@/services/LoggingService';
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';

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

/** Re-read a dog's registrations after a server-side create wrote them. */
export async function mirrorServerDogRegistrations(dogId: string): Promise<void> {
  try {
    await replicatedDogRegistrationsTable.refreshDogFromServer(dogId);
  } catch (error) {
    await notifyAfterFailedMirror('refresh-dog', error);
  }
}

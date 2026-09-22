import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';

const REFRESH_WAIT_MS = 3000;

/** Refresh partial caches without letting a stalled connection block offline reads. */
export async function refreshShowEntriesForRead(showId: string): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(replicatedEntriesTable.sync(showId)).then(
        result => result.success === true,
        () => false
      ),
      new Promise<boolean>(resolve => {
        timeout = setTimeout(() => resolve(false), REFRESH_WAIT_MS);
      }),
    ]);
  } catch {
    // The existing cached read remains usable when sync is unavailable.
    return false;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

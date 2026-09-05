import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';

const REFRESH_WAIT_MS = 3000;

/** Refresh partial caches without letting a stalled connection block offline reads. */
export async function refreshShowEntriesForRead(showId: string): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      replicatedEntriesTable.sync(showId),
      new Promise<void>(resolve => {
        timeout = setTimeout(resolve, REFRESH_WAIT_MS);
      }),
    ]);
  } catch {
    // The existing cached read remains usable when sync is unavailable.
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

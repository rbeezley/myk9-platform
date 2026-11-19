import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { mutationManager } from '@/services/replication/sharedMutationManager';
import { PremiumPublishError } from './premiumPublishErrors';

interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

/**
 * MYK9-2244: a copy-only publish prints the SERVER's facts, so the show edit just saved must
 * have reached the server first. Bounded wait for the show's queued writes to leave the queue
 * (one upload request, then a short poll); a queue that does not drain (offline, a failing write)
 * stops the publish with a sync message instead of printing the previous values.
 */
export async function waitForShowSync(
  showId: string,
  { timeoutMs = 15_000, intervalMs = 500 }: WaitOptions = {}
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let requested = false;
  for (;;) {
    let unsynced = true;
    try {
      unsynced = await replicatedShowsTable.hasUnsyncedWork(showId);
    } catch {
      // A queue read can fail before the session resolves; treat it as not yet synced.
    }
    if (!unsynced) return;
    if (!requested) {
      mutationManager.requestUpload();
      requested = true;
    }
    if (Date.now() + intervalMs > deadline) {
      throw new PremiumPublishError(
        "This device's show changes haven't reached myK9Show yet",
        'experience-snapshot',
        'show-syncing'
      );
    }
    await new Promise<void>(resolve => setTimeout(resolve, intervalMs));
  }
}

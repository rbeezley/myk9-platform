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
    // A write the server refused leaves the queue too, so an empty queue is not proof it synced;
    // and a refused insert keeps a new show local-only, so a non-empty queue is rechecked too.
    await refuseRejectedWrites(showId);
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

async function refuseRejectedWrites(showId: string): Promise<void> {
  let rejected: boolean;
  try {
    rejected = await replicatedShowsTable.hasRejectedWork(showId);
  } catch {
    // Unreadable failed-mutation store: unverified, so the publish stops rather than printing
    // facts the server may not hold.
    throw new PremiumPublishError(
      "This device's show changes haven't reached myK9Show yet",
      'experience-snapshot',
      'show-syncing'
    );
  }
  if (rejected) {
    throw new PremiumPublishError(
      'A change to this show was refused by myK9Show',
      'experience-snapshot',
      'show-rejected'
    );
  }
}

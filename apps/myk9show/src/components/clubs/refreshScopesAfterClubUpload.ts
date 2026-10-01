import { mutationManager } from '@/services/replication/sharedMutationManager';

interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

/**
 * MYK9-905: a creator becomes `club_admin` of a new club through
 * `trg_grant_club_admin_to_club_creator`, which fires when the club's INSERT
 * reaches the server. Clubs are created through the replication queue, so the
 * INSERT uploads after the form closes and the user's cached role scopes (and
 * therefore the Edit button on `/clubs/:id`) stay stale until the next 5-minute
 * RBAC poll. Wait, bounded, for the club's queued INSERT to leave the queue,
 * then run the existing RBAC refresh once. This is a one-shot wait, not a poll.
 *
 * Returns true when the refresh ran. A queue that never drains (offline) returns
 * false; the lifecycle's own poll and `online` handler pick the grant up then.
 */
export async function refreshScopesAfterClubUpload(
  clubId: string,
  refreshPermissions: () => Promise<void>,
  { timeoutMs = 60_000, intervalMs = 1000 }: WaitOptions = {}
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const pending = await mutationManager.getPendingMutationsForRow('clubs', clubId);
      if (pending.length === 0) {
        await refreshPermissions();
        return true;
      }
    } catch {
      // A queue read can fail before the session resolves; keep waiting.
    }
    if (Date.now() + intervalMs > deadline) return false;
    await new Promise<void>(resolve => setTimeout(resolve, intervalMs));
  }
}

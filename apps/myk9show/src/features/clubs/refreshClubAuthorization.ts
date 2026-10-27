import type { QueryClient } from '@tanstack/react-query';
import { clubQueryKeys } from '@/hooks/queries/useClubsDatabase';
import type { ClubReadinessStatus } from '@/store/clubStore';

/**
 * The publish gate (useClubAuthorization in useClubStripeAccount.ts, read by
 * ShowStatusPill / ShowEditPanel) caches a club's authorized_at under this key,
 * separately from the club replica. Every write path to authorized_at goes
 * through here so the key is spelled once.
 */
export function clubAuthorizationQueryKey(clubId: string | undefined) {
  // `undefined` is the disabled useClubAuthorization query's key, unchanged from before.
  return ['club-authorization', clubId] as const;
}

type EnsureClubsReady = (options?: {
  requestedClubId?: string;
  force?: boolean;
}) => Promise<{ status: ClubReadinessStatus }>;

/**
 * What this device must refresh after `clubs.authorized_at` changed on the
 * server, whichever surface changed it: the club page's Authorize / Revoke
 * action (useClubAuthorizationControl) or approving a club access request on
 * Admin → Onboarding, which authorizes the club in the same transaction
 * (MYK9-1310). Two consumers, two caches, one place (Codex review of #3151).
 *
 * 1. The club replica. set_club_authorization()'s UPDATE bumps clubs.updated_at
 *    (clubs_version_increment / update_clubs_updated_at), so a forced resync picks
 *    up the new authorized_at on the next incremental pull. Without it, `/clubs/:id`
 *    reads useClubStore, whose freshness shortcut keeps the old row, and the page
 *    still says "Unauthorized" until the next background sync.
 * 2. The publish gate's own react-query cache (see clubAuthorizationQueryKey),
 *    which has its own staleTime and is never touched by the replication sync, so a
 *    show's Publish could keep refusing on a stale "unauthorized" read.
 *
 * Returns the replica's readiness so the caller can say whether the page it is on
 * already shows the change (MYK9-750).
 */
export async function refreshClubAuthorization({
  queryClient,
  ensureClubsReady,
  clubId,
}: {
  queryClient: QueryClient;
  ensureClubsReady: EnsureClubsReady;
  clubId: string;
}): Promise<ClubReadinessStatus> {
  const readiness = await ensureClubsReady({ requestedClubId: clubId, force: true });
  await queryClient.invalidateQueries({ queryKey: clubAuthorizationQueryKey(clubId) });
  // The admin to-do list of pending clubs (MYK9-1448).
  await queryClient.invalidateQueries({ queryKey: clubQueryKeys.awaitingAuthorization() });
  return readiness.status;
}

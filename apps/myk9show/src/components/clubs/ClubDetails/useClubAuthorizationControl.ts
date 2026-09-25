/**
 * MYK9-572: site-admin-only "authorize / revoke" control for a club, on the
 * existing club detail surface (`/clubs/:id`) — no new admin page.
 *
 * Extracted from `useClubDetailsState` so that hook stays under the 500-line
 * ceiling, mirroring how `clubPermissions.ts` was already split out.
 *
 * Round-2 review (P2-B/P2-C/P3-11/P3-12): `isClubAuthorized` now derives
 * straight from the already-loaded `club.authorizedAt` instead of running a
 * second `['club-authorization', clubId]` query — the club page already has
 * the row, and a second query with different cache options than
 * useClubAuthorization (useClubStripeAccount.ts) under the SAME key was two
 * bugs at once: a stale-cache/error collapse (an errored fetch rendered as
 * "definitely unauthorized" to a site admin) and cache-config drift on a
 * shared key. This also means the badge is visible to ANY viewer who can see
 * the club (clubs_select already scopes that), not just a site admin — only
 * the authorize/revoke AFFORDANCE stays gated on isSiteAdmin.
 */
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setClubAuthorization } from '@/services/database/clubs';
import { useClubStore } from '@/store/clubStore';
import { notifications } from '@/lib/notifications';
import { getErrorMessage } from '@myk9/core';
import type { Club } from '@/types/club-types';

export function useClubAuthorizationControl(club: Club | null | undefined, isSiteAdmin: boolean) {
  const ensureClubsReady = useClubStore(s => s.ensureClubsReady);
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = useState(false);
  const clubId = club?.id;

  const setAuthorization = useCallback(
    async (authorized: boolean) => {
      if (!clubId) return;
      setIsUpdating(true);
      try {
        await setClubAuthorization(clubId, authorized);
        // set_club_authorization()'s UPDATE bumps clubs.updated_at
        // (clubs_version_increment / update_clubs_updated_at), so a forced
        // resync picks up the new authorized_at on the next incremental
        // pull — this is how the badge/menu item reflect the change
        // immediately instead of waiting for the next background sync.
        const readiness = await ensureClubsReady({ requestedClubId: clubId, force: true });
        // useClubAuthorization (useClubStripeAccount.ts) caches the SAME
        // authorized_at under a separate react-query key for the publish
        // gate (ShowStatusPill / ShowEditPanel). That cache has its own
        // moderate staleTime and is never touched by the replication sync
        // above, so without this a show's publish UI could keep reading a
        // stale authorization state after a site admin authorizes/revokes
        // the club from THIS page, until the cache happens to go stale.
        await queryClient.invalidateQueries({ queryKey: ['club-authorization', clubId] });
        const done = authorized ? 'Club authorized.' : 'Club authorization revoked.';
        // The change is saved either way; only a fresh resync means the header
        // and menu on this page already show it (MYK9-750).
        if (readiness.status === 'fresh') notifications.success(done);
        else
          notifications.warning(
            `${done} This page could not refresh yet; reload to see the change.`
          );
      } catch (error) {
        notifications.error(getErrorMessage(error) || 'Could not update club authorization.');
      } finally {
        setIsUpdating(false);
      }
    },
    [clubId, ensureClubsReady, queryClient]
  );

  return {
    // The badge is visible to ANY viewer who can see this club at all
    // (clubs_select already scopes that); only the authorize/revoke
    // AFFORDANCE is gated on isSiteAdmin, matching set_club_authorization's
    // own server-side check.
    canAuthorizeClub: isSiteAdmin,
    // MYK9-572 round 2: club.authorizedAt can now be `undefined` (field never
    // synced on this device yet — see clubStore.ts's replicatedToClub) as
    // well as `null` (explicitly unauthorized) or a timestamp (authorized).
    // Collapsing undefined into "unauthorized" via `!= null` painted every
    // pre-deploy cached club as revoked to its own admins; keep the three
    // states distinct so the UI can render an actual loading/unknown state
    // instead of a false negative.
    isClubAuthorized: club?.authorizedAt === undefined ? undefined : club.authorizedAt != null,
    // Round 4 (P3-5): derive from the same undefined-vs-null distinction
    // above instead of a hard-coded `false` — the field hasn't synced to
    // this device yet, so ClubHeader can show a loading state instead of
    // rendering isClubAuthorized === undefined as a false "authorized".
    isAuthorizationLoading: club?.authorizedAt === undefined,
    isAuthorizationUpdating: isUpdating,
    handleAuthorizeClub: () => void setAuthorization(true),
    handleRevokeAuthorization: () => void setAuthorization(false),
  };
}

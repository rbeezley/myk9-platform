import { useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useClubStore } from '@/store/clubStore';
import { clubsWithheldMessage } from '@/store/clubsIdentity';
import { useDirectoryViewer } from '@/hooks/useDirectoryViewer';
import { CLUB_LOOKUP_QUERY_OPTIONS, withClubLookupDeadline } from '@/hooks/clubLookupDeadline';
import {
  type GuestReadState,
  resolveGuestRead,
  useQueryOnlineStatus,
} from '@/hooks/guestServerRead';
import { getPublicClubById } from '@/services/database/clubs';
import { isValidUUID } from '@/utils/validation';
import type { Club } from '@/types/club-types';

export type ClubDetailStatus = 'loading' | 'ready' | 'not-found' | 'unavailable' | 'offline';

export interface ClubDetailData {
  club: Club | null;
  status: ClubDetailStatus;
  isGuest: boolean;
  /** Why the replica withholds this account's clubs, in plain words; null when it does not. */
  withheldMessage: string | null;
  retry: () => void;
}

/** What a server read of one club means for the page; a bad id never asked. */
function serverStatus(idUsable: boolean, read: GuestReadState<Club | null>): ClubDetailStatus {
  if (!idUsable) return 'not-found';
  if (read.kind === 'offline') return 'offline';
  if (read.kind === 'error') return 'unavailable';
  if (read.kind === 'loading') return 'loading';
  return read.data ? 'ready' : 'not-found';
}

export const PUBLIC_CLUB_DETAIL_QUERY_KEY = ['clubs', 'public-detail'] as const;

function withShowArrays(club: Club): Club {
  // Ensure arrays are defined for ClubDetails
  return {
    ...club,
    upcomingShows: Array.isArray(club.upcomingShows) ? club.upcomingShows : [],
    pastShows: Array.isArray(club.pastShows) ? club.pastShows : [],
  };
}

/**
 * The club behind /clubs/:id. Signed-in viewers read the clubs replica, and
 * the server for one club the replica lacks (never cached); guests read the
 * server only.
 */
export function useClubDetailData(id: string | undefined): ClubDetailData {
  const { isGuest, isSignedIn, authLoading, principalKey } = useDirectoryViewer();
  // A malformed id is not found, with no request.
  const idUsable = Boolean(id) && isValidUUID(id as string);
  // Only a signed-in viewer reads the replica (see the INTENT below).
  const replicaClub = useClubStore(state =>
    isSignedIn && id ? (state.clubs.find(c => c.id === id) ?? null) : null
  );
  const readiness = useClubStore(state => state.clubReadiness);
  const ensureClubsReady = useClubStore(state => state.ensureClubsReady);
  const withheldReason = useClubStore(state => state.clubsIdentity.reason);

  // INTENT: same owner decision as the guest directory (MYK9-747; see the
  // INTENT in useBrowseClubsData). The clubs replica is shared across sign-in
  // states on one device, so a guest opening a link to a revoked or
  // never-authorized club must get the server's answer, never a cached row,
  // not even offline, and never a cached query result (guestServerRead.ts).
  // No row from clubs_select means not found.
  const guestQuery = useQuery({
    queryKey: [...PUBLIC_CLUB_DETAIL_QUERY_KEY, id, principalKey],
    queryFn: () => withClubLookupDeadline(() => getPublicClubById(id as string)),
    enabled: isGuest && idUsable,
    ...CLUB_LOOKUP_QUERY_OPTIONS,
  });
  const isOnline = useQueryOnlineStatus();
  const guestRead = resolveGuestRead(guestQuery, isOnline);

  useEffect(() => {
    if (isSignedIn) void ensureClubsReady({ requestedClubId: id });
  }, [ensureClubsReady, id, isSignedIn]);

  // MYK9-2153: a club this device's list lacks (an unchanged pending club the
  // site admin never pulled) is read from the server for this page only. RLS
  // decides what the viewer sees, and the row is NEVER written to the shared
  // replica, so the next account on this browser cannot see it.
  const fallbackQuery = useQuery({
    queryKey: [...PUBLIC_CLUB_DETAIL_QUERY_KEY, id, principalKey],
    queryFn: () =>
      withClubLookupDeadline(() => getPublicClubById(id as string, { withAuthorization: true })),
    enabled: isSignedIn && idUsable && readiness === 'fresh' && !replicaClub,
    ...CLUB_LOOKUP_QUERY_OPTIONS,
  });
  const fallbackRead = resolveGuestRead(fallbackQuery, isOnline);

  const refetchGuest = guestQuery.refetch;
  const refetchFallback = fallbackQuery.refetch;
  const retry = useCallback(() => {
    if (isGuest) {
      void refetchGuest();
      return;
    }
    if (readiness === 'fresh' && !replicaClub) void refetchFallback();
    void ensureClubsReady({ requestedClubId: id, force: true });
  }, [isGuest, refetchGuest, refetchFallback, readiness, replicaClub, ensureClubsReady, id]);

  const serverRead = isGuest ? guestRead : fallbackRead;
  const serverClub = serverRead.kind === 'ready' ? serverRead.data : null;
  const rawClub = replicaClub ?? serverClub;
  const club = rawClub ? withShowArrays(rawClub) : null;

  let status: ClubDetailStatus;
  if (authLoading) {
    status = 'loading';
  } else if (isGuest) {
    status = serverStatus(idUsable, guestRead);
  } else if (replicaClub) {
    status = 'ready';
  } else if (readiness === 'loading') {
    status = 'loading';
  } else if (readiness === 'unavailable' || readiness === 'offline') {
    status = 'unavailable';
  } else if (readiness === 'fresh') {
    status = serverStatus(idUsable, fallbackRead);
  } else {
    status = 'ready';
  }

  return {
    club,
    status,
    isGuest,
    withheldMessage:
      isGuest || withheldReason === null ? null : clubsWithheldMessage(withheldReason),
    retry,
  };
}

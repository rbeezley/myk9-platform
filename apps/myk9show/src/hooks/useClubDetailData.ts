import { useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useClubStore } from '@/store/clubStore';
import { useDirectoryViewer } from '@/hooks/useDirectoryViewer';
import { getPublicClubById } from '@/services/database/clubs';
import type { Club } from '@/types/club-types';

export type ClubDetailStatus = 'loading' | 'ready' | 'not-found' | 'unavailable' | 'offline';

export interface ClubDetailData {
  club: Club | null;
  status: ClubDetailStatus;
  isGuest: boolean;
  retry: () => void;
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
 * The club behind /clubs/:id. Signed-in viewers read the clubs replica
 * (unchanged); guests read the server only.
 */
export function useClubDetailData(id: string | undefined): ClubDetailData {
  const { isGuest, isSignedIn, authLoading, principalKey } = useDirectoryViewer();
  // Only a signed-in viewer reads the replica (see the INTENT below).
  const replicaClub = useClubStore(state =>
    isSignedIn && id ? (state.clubs.find(c => c.id === id) ?? null) : null
  );
  const readiness = useClubStore(state => state.clubReadiness);
  const ensureClubsReady = useClubStore(state => state.ensureClubsReady);

  // INTENT: same owner decision as the guest directory (MYK9-747; see the
  // INTENT in useBrowseClubsData). The clubs replica is shared across sign-in
  // states on one device, so a guest opening a link to a revoked or
  // never-authorized club must get the server's answer, never a cached row,
  // not even offline. No row from clubs_select means not found.
  const guestQuery = useQuery({
    queryKey: [...PUBLIC_CLUB_DETAIL_QUERY_KEY, id, principalKey],
    queryFn: () => getPublicClubById(id as string),
    enabled: isGuest && Boolean(id),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (isSignedIn) void ensureClubsReady({ requestedClubId: id });
  }, [ensureClubsReady, id, isSignedIn]);

  const refetchGuest = guestQuery.refetch;
  const retry = useCallback(() => {
    if (isGuest) {
      void refetchGuest();
      return;
    }
    void ensureClubsReady({ requestedClubId: id, force: true });
  }, [isGuest, refetchGuest, ensureClubsReady, id]);

  const rawClub = isGuest ? (guestQuery.data ?? null) : replicaClub;
  const club = useMemo(() => (rawClub ? withShowArrays(rawClub) : null), [rawClub]);

  let status: ClubDetailStatus;
  if (authLoading) {
    status = 'loading';
  } else if (isGuest) {
    if (!id || guestQuery.data === null) status = 'not-found';
    else if (guestQuery.data) status = 'ready';
    else if (guestQuery.fetchStatus === 'paused') status = 'offline';
    else if (guestQuery.isError) status = 'unavailable';
    else status = 'loading';
  } else if (readiness === 'loading' && !club) {
    status = 'loading';
  } else if ((readiness === 'unavailable' || readiness === 'offline') && !club) {
    status = 'unavailable';
  } else if (readiness === 'fresh' && id && !club) {
    status = 'not-found';
  } else {
    status = 'ready';
  }

  return { club, status, isGuest, retry };
}

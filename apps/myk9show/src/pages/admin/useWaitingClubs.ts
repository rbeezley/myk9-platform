import { useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useClubsAwaitingAuthorizationQuery } from '@/hooks/queries/useClubsDatabase';
import {
  getDeclinedRequestClubIds,
  getPendingClubAccessRequests,
} from '@/services/database/club-access-requests';
import { buildWaitingClubRows, type WaitingClubRow } from './waitingClubRows';

/** Query keys of the waiting-clubs reads, so a change that closes a request can refresh them. */
export const WAITING_REQUESTS_KEY = ['club-access-requests', 'pending'] as const;
export const DECLINED_REQUESTS_KEY = ['club-access-requests', 'declined'] as const;

export interface WaitingClubs {
  rows: WaitingClubRow[];
  /** The number of rows, or undefined until the list has loaded (never a guess of 0). */
  count: number | undefined;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  refresh: () => Promise<void>;
}

/**
 * MYK9-2529: the ONE read of the clubs waiting for a site admin. Onboarding's list, the
 * dashboard's "Club requests waiting" and the Admin menu's badge all take their rows, or the
 * length of them, from here, so the numbers cannot drift. A club is waiting when it is
 * unauthorized and not declined, whether or not a request asked for it.
 *
 * `creator` narrows the LIST to one creator's clubs (MYK9-1395 notification link); a count
 * never passes it. `enabled` keeps a non-admin from reading admin data.
 *
 * Online-only: an admin to-do list reads the server, not this device's replica.
 */
export function useWaitingClubs({
  creator,
  enabled = true,
}: { creator?: string | undefined; enabled?: boolean } = {}): WaitingClubs {
  const clubsQuery = useClubsAwaitingAuthorizationQuery(creator, enabled);
  const requestsQuery = useQuery({
    queryKey: WAITING_REQUESTS_KEY,
    queryFn: getPendingClubAccessRequests,
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const declinedQuery = useQuery({
    queryKey: DECLINED_REQUESTS_KEY,
    queryFn: getDeclinedRequestClubIds,
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const { refetch: refetchClubs } = clubsQuery;
  const { refetch: refetchRequests } = requestsQuery;
  const { refetch: refetchDeclined } = declinedQuery;

  // A cached list from an earlier visit is not good enough for a to-do list: another admin may
  // have approved a club, or a new one may have been made, within the cache window.
  useEffect(() => {
    if (enabled) void refetchClubs();
  }, [enabled, refetchClubs, creator]);

  const refresh = useCallback(async () => {
    await Promise.all([refetchClubs(), refetchRequests(), refetchDeclined()]);
  }, [refetchClubs, refetchRequests, refetchDeclined]);

  const rows = useMemo(
    () =>
      buildWaitingClubRows(
        clubsQuery.data ?? [],
        requestsQuery.data ?? [],
        Boolean(creator),
        new Set(declinedQuery.data ?? [])
      ),
    [clubsQuery.data, requestsQuery.data, declinedQuery.data, creator]
  );

  const isPending =
    enabled && (clubsQuery.isPending || requestsQuery.isPending || declinedQuery.isPending);
  const isError = clubsQuery.isError || requestsQuery.isError || declinedQuery.isError;

  return {
    rows,
    count: enabled && !isPending && !isError ? rows.length : undefined,
    isPending,
    isError,
    isFetching: clubsQuery.isFetching || requestsQuery.isFetching || declinedQuery.isFetching,
    refresh,
  };
}
